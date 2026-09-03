'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const LLM_MODEL = process.env.LLM_MODEL || 'hermes3:latest';

const STITCH_DIR = path.join(__dirname, '.stitch');
const DESIGN_PATH = path.join(STITCH_DIR, 'DESIGN.md');
const SITE_PATH = path.join(STITCH_DIR, 'SITE.md');
const NEXT_PROMPT_PATH = path.join(STITCH_DIR, 'next-prompt.md');
const DOCS_DIR = path.join(__dirname, 'docs');

async function executeLoop() {
    console.log('🤖 Starting GraveFlow Stitch Agent Build Loop...');

    // 1. Read the next prompt baton
    if (!fs.existsSync(NEXT_PROMPT_PATH)) {
        console.error('❌ next-prompt.md not found in .stitch folder!');
        process.exit(1);
    }
    const promptContent = fs.readFileSync(NEXT_PROMPT_PATH, 'utf-8');

    // Parse YAML frontmatter
    const frontmatterMatch = promptContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!frontmatterMatch) {
        console.error('❌ next-prompt.md lacks valid YAML frontmatter delimiters!');
        process.exit(1);
    }

    const yamlStr = frontmatterMatch[1];
    const promptBody = frontmatterMatch[2];

    const pageMatch = yamlStr.match(/page:\s*([a-zA-Z0-9-_]+)/);
    if (!pageMatch) {
        console.error('❌ Could not parse output "page" from next-prompt.md YAML frontmatter!');
        process.exit(1);
    }
    const pageName = pageMatch[1].trim();
    console.log(`📌 Target Page: ${pageName}`);

    // Read site context and design specifications
    const designSpecs = fs.existsSync(DESIGN_PATH) ? fs.readFileSync(DESIGN_PATH, 'utf-8') : '';

    console.log(`🧠 Contacting Hermes AI Supercomputer (${OLLAMA_HOST}) with model ${LLM_MODEL}...`);
    const systemPrompt = `You are an elite software architect and senior frontend designer at GraveFlow Inc.
Generate a premium, complete, single-file HTML page for the following prompt:
"${promptBody}"

Your design MUST adhere strictly to the following styling specs:
${designSpecs}

Return ONLY the complete HTML code within a single \`\`\`html ... \`\`\` code block. Do not write conversational preamble, explanations, or text outside the block. Include full CSS styling inside a <style> block and make it responsive.`;

    let response;
    try {
        response = await fetch(`${OLLAMA_HOST}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: LLM_MODEL,
                prompt: systemPrompt,
                stream: false,
                options: {
                    num_predict: 8192, // large output token limit for full page generation
                    temperature: 0.2
                }
            })
        });
    } catch (err) {
        console.log(`⚠️  Remote Ollama failed (${err.message}). Falling back to local http://127.0.0.1:11434...`);
        response = await fetch(`http://127.0.0.1:11434/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: LLM_MODEL,
                prompt: systemPrompt,
                stream: false,
                options: {
                    num_predict: 8192,
                    temperature: 0.2
                }
            })
        });
    }

    if (!response.ok) {
        throw new Error(`Ollama node returned: ${response.statusText}`);
    }

    try {
        const data = await response.json();
        const rawOutput = data.response;

        // Parse HTML from the code block
        const codeBlockMatch = rawOutput.match(/```html\r?\n([\s\S]*?)\r?\n```/) || rawOutput.match(/```([\s\S]*?)```/);
        let htmlCode = codeBlockMatch ? codeBlockMatch[1].trim() : rawOutput.trim();

        // Strip HTML wrapper markdown prefix/suffix if the LLM outputted them loosely
        if (htmlCode.startsWith('<!DOCTYPE') === false && htmlCode.includes('<!DOCTYPE')) {
            htmlCode = htmlCode.substring(htmlCode.indexOf('<!DOCTYPE'));
        }

        // Save generated file to docs/
        const targetFilename = `${pageName}.html`;
        const targetPath = path.join(DOCS_DIR, targetFilename);
        fs.writeFileSync(targetPath, htmlCode, 'utf-8');
        console.log(`✅ Generated page successfully written to: ${targetPath}`);

        // 2. Integrate into index.html and sidebars
        integratePage(pageName);

        // 3. Update SITE.md roadmap to mark as complete
        updateSiteRoadmap(pageName);

        // 4. Prepare the next prompt baton
        prepareNextBaton();

    } catch (err) {
        console.error('❌ Loop Execution failed:', err.message);
        process.exit(1);
    }
}

function integratePage(pageName) {
    const formattedTitle = pageName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    console.log(`⛓️  Integrating ${pageName} into Document Center index & nav sidebars...`);

    // A. Update docs/index.html with a card link
    const indexLink = path.join(DOCS_DIR, 'index.html');
    if (fs.existsSync(indexLink)) {
        let indexHtml = fs.readFileSync(indexLink, 'utf-8');
        const targetMarker = '<!-- ============================';
        const cardPattern = `    <a href="${pageName}.html" class="doc-card">
      <div class="doc-card-icon">📖</div>
      <div class="doc-card-badge badge-internal">Public · Reference</div>
      <div class="doc-card-title">${formattedTitle}</div>
      <div class="doc-card-desc">Autonomously generated guide detailing operational parameters, safety, and policies.</div>
      <div class="updated">Updated July 2026</div>
    </a>`;

        // Check if card already exists
        if (!indexHtml.includes(`href="${pageName}.html"`)) {
            // Find insertion point inside Investor & Business Documents grid (ends at line 144 before external documents)
            const docGridMarker = '<div class="section-label">🌐 External Documents</div>';
            const insertIndex = indexHtml.indexOf(docGridMarker);
            if (insertIndex !== -1) {
                // Insert the new card right before the section-label
                const gridCloseIndex = indexHtml.lastIndexOf('</div>', insertIndex);
                if (gridCloseIndex !== -1) {
                    indexHtml = indexHtml.slice(0, gridCloseIndex) + '\n' + cardPattern + indexHtml.slice(gridCloseIndex);
                    fs.writeFileSync(indexLink, indexHtml, 'utf-8');
                    console.log('✅ Added document card to docs/index.html');
                }
            }
        }
    }

    // B. Update Sidebars in all document pages
    const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.html') && f !== 'index.html');
    const newNavLink = `  <a class="nav-link internal" href="${pageName}.html">📖 ${formattedTitle}</a>`;

    for (const file of files) {
        const filepath = path.join(DOCS_DIR, file);
        let fileContent = fs.readFileSync(filepath, 'utf-8');

        // Check if sidebar has link already
        if (!fileContent.includes(`href="${pageName}.html"`)) {
            const navSectionMarker = '<div class="nav-section">Internal</div>';
            const insertIndex = fileContent.indexOf(navSectionMarker);
            if (insertIndex !== -1) {
                // Insert above the internal section marker
                fileContent = fileContent.slice(0, insertIndex) + newNavLink + '\n' + fileContent.slice(insertIndex);
                // Also adjust active state if current file matches pageName
                if (file === `${pageName}.html`) {
                    fileContent = fileContent.replace(`href="${pageName}.html">📖 ${formattedTitle}</a>`, `href="${pageName}.html" class="nav-link internal active" style="color:var(--gold);font-weight:600">📖 ${formattedTitle}</a>`);
                }
                fs.writeFileSync(filepath, fileContent, 'utf-8');
            }
        }
    }
    console.log('✅ Integrated navigation links in all sidebars');
}

function updateSiteRoadmap(pageName) {
    if (fs.existsSync(SITE_PATH)) {
        let siteContent = fs.readFileSync(SITE_PATH, 'utf-8');
        const pattern = new RegExp('`\\[ \\]` `docs\\/' + pageName + '\\.html`', 'g');
        siteContent = siteContent.replace(pattern, `\`[x]\` \`docs/${pageName}.html\``);
        fs.writeFileSync(SITE_PATH, siteContent, 'utf-8');
        console.log(`✅ Marked docs/${pageName}.html as completed in SITE.md`);
    }
}

function prepareNextBaton() {
    if (!fs.existsSync(SITE_PATH)) return;
    const siteContent = fs.readFileSync(SITE_PATH, 'utf-8');

    // Look for first unchecked roadmap item
    const roadmapMatch = siteContent.match(/\*\s+\`\[ \]\`\s+\`docs\/([a-zA-Z0-9-_]+)\.html\`\s+—\s+(.*)/);
    if (roadmapMatch) {
        const nextTarget = roadmapMatch[1];
        const nextDescription = roadmapMatch[2];

        const designSpecs = fs.existsSync(DESIGN_PATH) ? fs.readFileSync(DESIGN_PATH, 'utf-8') : '';

        const nextBaton = `---
page: ${nextTarget}
---
Generate the local-coordinator-guide document for GraveFlow.
Details: ${nextDescription}

**DESIGN SYSTEM (REQUIRED):**
- Primary Background: Deep Obsidian (#08080a)
- Card Surfaces: Charcoal Glass (#0d0e12) with 1px border solid rgba(201, 168, 76, 0.15)
- Typography: Serif headings (Georgia/system-serif) and modern sans-serif body text (Inter)
- Layout: Structured navigation, responsive card-based layout, glassmorphic styles
- Mission Alignment: Emphasize the core Love Effect OS motto "Love, verified." and the KGU International vision "No Human Left Behind."

**Page Structure:**
1. Document header with breadcrumbs and matching metadata
2. Clean grid detailing Coordinator role, onboarding verification checklists, and driver payment payout flow controls
3. detailed answers inside stylized glassmorphic card containers
4. Page footer with back-links and C-Corp contacts
`;

        fs.writeFileSync(NEXT_PROMPT_PATH, nextBaton, 'utf-8');
        console.log(`➡️  Passed baton for next iteration: ${nextTarget}`);
    } else {
        // Clear baton to signify roadmap completion
        fs.writeFileSync(NEXT_PROMPT_PATH, `# All roadmap pages generated successfully.\n# Site is up-to-date!`, 'utf-8');
        console.log('🎉 Roadmap complete! No further pages in backlog.');
    }
}

executeLoop();
