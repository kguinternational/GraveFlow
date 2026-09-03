// ==========================================
// GRAVEFLOW AUTHENTICATION GUARD
// ==========================================

(async () => {
    // Hide body immediately to prevent FOUC (Flash of Unauthenticated Content)
    const style = document.createElement('style');
    style.id = 'auth-hide-body-style';
    style.innerHTML = 'body { display: none !important; }';
    document.head.appendChild(style);

    const token = localStorage.getItem('gf_token');
    const requiredRoles = window.REQUIRED_ROLES || [];

    const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:'
      ? 'http://localhost:8002'
      : window.location.origin + '/api';

    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const redirectUrl = `login.html?redirect=${encodeURIComponent(currentPath)}&roles=${requiredRoles.join(',')}`;

    function allowAccess(user) {
        window.currentUser = user;
        // Remove the hiding style
        const el = document.getElementById('auth-hide-body-style');
        if (el) el.remove();
        // Notify page scripts that authentication is complete
        window.dispatchEvent(new CustomEvent('auth-ready', { detail: user }));
    }

    if (!token) {
        window.location.href = redirectUrl;
        return;
    }

    try {
        const resp = await fetch(`${API_BASE}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!resp.ok) {
            localStorage.removeItem('gf_token');
            window.location.href = redirectUrl;
            return;
        }

        const data = await resp.json();
        const user = data.user;

        if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
            window.location.href = `login.html?error=unauthorized&redirect=${encodeURIComponent(currentPath)}`;
            return;
        }

        allowAccess(user);
    } catch (err) {
        console.warn('Auth server unreachable, falling back to local JWT payload decode:', err);
        // Fallback: decode JWT locally to allow offline/sovereign usage if token matches role
        try {
            const parts = token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1]));
                // Check if token has expired (exp is in seconds)
                if (payload.exp && Date.now() >= payload.exp * 1000) {
                    throw new Error('Token expired');
                }
                if (requiredRoles.length > 0 && !requiredRoles.includes(payload.role)) {
                    window.location.href = redirectUrl;
                    return;
                }
                allowAccess(payload);
                return;
            }
        } catch (e) {
            console.error('Local JWT decode failed:', e);
        }
        window.location.href = redirectUrl;
    }
})();
