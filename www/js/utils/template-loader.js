// Template Loader Utility
// Loads HTML templates from separate .html files

export class TemplateLoader {
    static async loadTemplate(templateName) {
        try {
            const response = await fetch(`templates/${templateName}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load template: ${templateName}`);
            }
            return await response.text();
        } catch (error) {
            console.error(`Error loading template ${templateName}:`, error);
            return '';
        }
    }

    static async loadAllTemplates() {
        const templates = [
            'auth',
            'navigation',
            'modals',
            'items',
            'billing',
            'history',
            'due',
            'stock',
            'sales',
            'payments',
            'reports',
            'configure',
            'settings',
            'finance',
            'analytics',
            'users',
            'chat'
        ];

        const results = {};
        
        // Load all templates in parallel
        await Promise.all(
            templates.map(async (name) => {
                results[name] = await this.loadTemplate(name);
            })
        );

        return results;
    }

    static injectTemplates(templates) {
        // Inject auth screen first
        document.body.insertAdjacentHTML('afterbegin', templates.auth);
        
        // Create app content wrapper
        const appContent = document.createElement('div');
        appContent.id = 'appContent';
        appContent.className = 'hidden';
        
        // Inject all tab content
        appContent.innerHTML = templates.navigation + 
                              templates.billing + 
                              templates.items + 
                              templates.history + 
                              templates.due + 
                              templates.stock + 
                              templates.sales + 
                              templates.payments + 
                              templates.reports + 
                              templates.configure + 
                              templates.settings + 
                              templates.finance + 
                              templates.analytics + 
                              templates.users + 
                              templates.chat;
        
        document.body.appendChild(appContent);
        
        // Inject modals at the end
        document.body.insertAdjacentHTML('beforeend', templates.modals);
        
        console.log('✅ All templates injected from HTML files');
    }
}
