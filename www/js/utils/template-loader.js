// Template Loader Utility
// Loads HTML templates from separate .html files

export class TemplateLoader {
    static async loadTemplate(templateName) {
        try {
            const response = await fetch(`templates/${templateName}.html`);
            if (!response.ok) {
                throw new Error(`Failed to load template: ${templateName}`);
            }
            const content = await response.text();
            console.log(`Template ${templateName} loaded, length: ${content.length}`);
            return content;
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
            'retail-sales',
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
        document.body.appendChild(appContent);
        
        // Inject each template individually using insertAdjacentHTML to ensure proper DOM parsing
        appContent.insertAdjacentHTML('beforeend', templates.navigation);
        appContent.insertAdjacentHTML('beforeend', templates.billing);
        appContent.insertAdjacentHTML('beforeend', templates.items);
        appContent.insertAdjacentHTML('beforeend', templates.history);
        appContent.insertAdjacentHTML('beforeend', templates.due);
        appContent.insertAdjacentHTML('beforeend', templates.stock);
        appContent.insertAdjacentHTML('beforeend', templates.sales);
        
        // Debug: Check if retail-sales template was loaded
        if (templates['retail-sales']) {
            console.log('✅ Retail-sales template loaded, length:', templates['retail-sales'].length);
            appContent.insertAdjacentHTML('beforeend', templates['retail-sales']);
        } else {
            console.error('❌ Retail-sales template is empty or undefined!');
        }
        
        appContent.insertAdjacentHTML('beforeend', templates.payments);
        appContent.insertAdjacentHTML('beforeend', templates.reports);
        appContent.insertAdjacentHTML('beforeend', templates.configure);
        appContent.insertAdjacentHTML('beforeend', templates.settings);
        appContent.insertAdjacentHTML('beforeend', templates.finance);
        appContent.insertAdjacentHTML('beforeend', templates.analytics);
        appContent.insertAdjacentHTML('beforeend', templates.users);
        appContent.insertAdjacentHTML('beforeend', templates.chat);
        
        // Inject modals at the end
        document.body.insertAdjacentHTML('beforeend', templates.modals);
        
        console.log('✅ All templates injected from HTML files');
    }
}
