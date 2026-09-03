Created At: 2026-07-13T23:46:23Z
Completed At: 2026-07-13T23:46:23Z
import os
import json
import argparse
from scripts.clay_client import search_leads, enrich_lead, save_to_csv, call_openrouter
from scripts.local_scraper import search_and_enrich_leads_local

def load_config():
    config_path = "config.json"
    if os.path.exists(config_path):
        with open(config_path, "r") as f:
            return json.load(f)
    return {}

def load_context():
    context = {}
    context_dir = "context"
    if not os.path.exists(context_dir):
        return context
        
    for filename in os.listdir(context_dir):
        if filename.endswith(".md"):
            with open(os.path.join(context_dir, filename), "r") as f:
                context[filename] = f.read()
    return context

def generate_personalized_copy(lead, context):
    """
    Pass the enriched lead and the business context to OpenRouter to generate
    personalized email subject and body.
    """
    system_instruction = """You are an expert cold email copywriter. Your goal is to write a highly personalized, high-converting cold email for a home services business owner.
You must use the provided Business Context of the agency sending the email to write a tailored offer.
The email MUST feel natural, human, and directly address a specific pain point or signal from the lead.
Do NOT use generic AI templates. Do NOT start with "I hope this email finds you well" or "My name is...".

Your output must be a valid JSON object containing exactly two keys:
- "subject": A short, intriguing, personalized subject line (e.g. referencing a review, a job posting, or a local city connection). Keep it under 6 words.
- "body": A short, punchy email body (under 100 words). It should state the context, offer the solution, reverse their risk with a guarantee, and end with a single call to action (CTA): asking if you can send a 90-second video explaining how it works.
"""

    user_prompt = f"""
Business Context (Sender info):
{json.dumps(context, indent=2)}

Lead Details (Receiver info):
{json.dumps(lead, indent=2)}

Generate the personalized subject and body for this lead. Output only valid JSON.
"""

    ai_response = call_openrouter(user_prompt, system_instruction)
    if ai_response:
        # Clean potential markdown wrappers if present
        if ai_response.startswith("```"):
            lines = ai_response.splitlines()
            if lines[0].startswith("```json") or lines[0].startswith("```"):
                ai_response = "\n".join(lines[1:-1])
        try:
            data = json.loads(ai_response)
            if "subject" in data and "body" in data:
                return data["subject"], data["body"]
        except Exception as e:
            print(f"Error parsing copywriting response: {e}. Content: {ai_response}")
            
    # Stub fallback if LLM copy generation fails
    name_part = lead.get('name', '').split()[0] if lead.get('name') else 'there'
    subject = f"Your {lead.get('notable_achievement', 'business')} looks great, {name_part}"
    body = f"Hey {name_part},\n\nSaw that you guys are {lead.get('business_pain_points', 'growing')}. We help businesses like {lead.get('company')} fix that without adding headcount.\n\nMind if I send over a 90-sec Loom video explaining how?\n\nCheers,\nTradewind Automations Team"
    return subject, body

def main():
    parser = argparse.ArgumentParser(description="Lead Generation Agent")
    parser.add_argument("--query", type=str, default="HVAC business owners in Houston", help="Search query for Clay")
    parser.add_argument("--limit", type=int, default=5, help="Number of leads to fetch")
    args = parser.parse_args()
    
    config = load_config()
    sourcing_engine = config.get("sourcing_engine", "ai")
    
    print("=== Loading Business Context ===")
    context = load_context()
    print(f"Loaded {len(context)} context files.\n")
    
    enriched_leads = []
    
    if sourcing_engine == "duckduckgo":
        print("=== Step 1 & 2: Sourcing and Enriching Leads via DuckDuckGo and BeautifulSoup ===")
        leads = search_and_enrich_leads_local(args.query, limit=args.limit)
        
        print("\n=== Step 3: Writing Personalized Copy via LLM ===")
        for lead in leads:
            subject, body = generate_personalized_copy(lead, context)
            lead["email_subject"] = subject
            lead["email_body"] = body
            # remove large scraped text from final CSV to keep it clean
            lead.pop("scraped_context", None)
            enriched_leads.append(lead)
            
    else:
        print("=== Step 1: Sourcing Leads ===")
        leads = search_leads(args.query, limit=args.limit)
        
        print("\n=== Step 2: Enriching Leads & Writing Copy ===")
        for lead in leads:
            # Enrich lead
            enriched_lead = enrich_lead(lead)
            
            # Generate Copy via LLM
            subject, body = generate_personalized_copy(enriched_lead, context)
            enriched_lead["email_subject"] = subject
            enriched_lead["email_body"] = body
            
            enriched_leads.append(enriched_lead)
        
    print("\n=== Final Step: Saving Results ===")
    save_to_csv(enriched_leads, "output_leads.csv")
    print("Done! Check output_leads.csv")

if __name__ == "__main__":
    main()

