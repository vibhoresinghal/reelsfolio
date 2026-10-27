'use strict';

// Select-only comboboxes. Hidden selects remain the dashboard's value store;
// only the custom trigger and listbox are exposed to users and assistive tech.
(() => {
    const controls = new Map();
    const paths = {
        chevron: '<path d="m7 10 5 5 5-5"/>', check: '<path d="m5 12 4 4L19 6"/>',
        screens: '<rect x="2" y="3" width="15" height="12" rx="2"/><path d="M6 19h7m-4-4v4"/><rect x="16" y="10" width="6" height="11" rx="1.5"/>',
        phone: '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>',
        desktop: '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M12 16v5m-4 0h8"/>',
        tablet: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M11 18h2"/>',
        people: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2m0-18a4 4 0 0 1 0 8m3 4a4 4 0 0 1 3 4v2"/>',
        return: '<path d="M9 4 4 9l5 5M4 9h10a6 6 0 0 1 0 12"/>',
        clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
        play: '<path d="m8 4 12 8-12 8Z"/>',
        heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
        sort: '<path d="M4 7h16M4 12h11M4 17h6"/>'
    };
    const svg = name => '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">' + paths[name] + '</svg>';
    const config = {
        deviceFilter: {label:'Device', icon:'screens', options:{'':'screens',phone:'phone',desktop:'desktop',tablet:'tablet'}},
        visitType: {label:'Visitor type', icon:'people', options:{'':'people',returning:'return',active:'clock'}},
        projectSort: {label:'Sort projects by', icon:'sort', options:{website:'sort',likes:'heart',seconds:'clock',views:'play',average:'clock'}},
        guestSession: {label:'Choose a visit', icon:'clock', options:{}}
    };

    function create(select) {
        const info = config[select.id];
        if (!info) return;
        const labels = [...select.labels];
        const wrapper = document.createElement('span'); wrapper.className = 'custom-select';
        select.before(wrapper); wrapper.append(select);
        select.hidden = true; select.tabIndex = -1; select.setAttribute('aria-hidden','true');
        const trigger = document.createElement('button');
        trigger.type = 'button'; trigger.id = select.id + 'Trigger'; trigger.className = 'select-trigger';
        trigger.setAttribute('role','combobox'); trigger.setAttribute('aria-haspopup','listbox');
        trigger.setAttribute('aria-expanded','false'); trigger.setAttribute('aria-controls',select.id + 'Options');
        trigger.innerHTML = svg(info.icon) + '<span class="select-value"></span>' + svg('chevron');
        const valueLabel = trigger.querySelector('.select-value');
        const panel = document.createElement('span'); panel.id = select.id + 'Options';
        panel.className = 'select-menu'; panel.setAttribute('popover','auto');
        panel.setAttribute('role','listbox'); panel.setAttribute('aria-label',info.label);
        wrapper.append(trigger,panel);
        labels.forEach(label => { label.htmlFor = trigger.id; });
        let active = 0, open = false, typed = '', typedAt = 0;
        const options = [...select.options];
        const rows = options.map((option,index) => {
            const row = document.createElement('span');
            row.id = select.id + 'Option' + index; row.className = 'select-option';
            row.setAttribute('role','option'); row.setAttribute('aria-disabled',String(option.disabled));
            row.innerHTML = svg(info.options[option.value] || info.icon) + '<span></span><span class="option-check">' + svg('check') + '</span>';
            row.querySelector('span').textContent = option.text;
            row.addEventListener('pointermove', () => { if (!option.disabled) highlight(index,false); });
            row.addEventListener('click', event => { event.preventDefault(); if (!option.disabled) choose(index); });
            panel.append(row); return row;
        });
        // Keep keyboard focus on the combobox, including mouse selection.
        panel.addEventListener('mousedown', event => event.preventDefault());
        function highlight(index,scroll = true) {
            active = index;
            rows.forEach((row,i) => row.classList.toggle('is-active',i === active));
            trigger.setAttribute('aria-activedescendant',rows[active].id);
            if (scroll) rows[active].scrollIntoView({block:'nearest'});
        }
        function position() {
            const rect = trigger.getBoundingClientRect(), viewport = window.visualViewport;
            const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
            const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
            const bottomRoom = top + height - rect.bottom - 16, topRoom = rect.top - top - 16;
            const up = bottomRoom < Math.min(panel.scrollHeight,260) && topRoom > bottomRoom;
            const menuWidth = Math.min(Math.max(rect.width,220),width - 24);
            panel.style.width = menuWidth + 'px';
            panel.style.maxHeight = Math.max(60,Math.min(320,up ? topRoom : bottomRoom)) + 'px';
            panel.style.left = Math.max(left + 12,Math.min(rect.left,left + width - menuWidth - 12)) + 'px';
            panel.style.top = (up ? rect.top - panel.getBoundingClientRect().height - 7 : rect.bottom + 7) + 'px';
            panel.dataset.side = up ? 'top' : 'bottom';
        }
        function close(focus = false) {
            if (panel.matches(':popover-open')) panel.hidePopover();
            open = false; trigger.setAttribute('aria-expanded','false'); trigger.removeAttribute('aria-activedescendant');
            typed = '';
            if (focus && trigger.isConnected) trigger.focus({preventScroll:true});
        }
        function show() {
            if (trigger.disabled || !options.length) return;
            controls.forEach(control => control.close());
            panel.showPopover(); open = true; trigger.setAttribute('aria-expanded','true');
            position(); highlight(Math.max(0,select.selectedIndex));
        }
        function sync() {
            const option = options[select.selectedIndex];
            valueLabel.textContent = option?.text || info.label;
            trigger.setAttribute('aria-label',info.label + ': ' + valueLabel.textContent);
            trigger.disabled = select.disabled;
            trigger.classList.toggle('has-filter',(select.id === 'deviceFilter' || select.id === 'visitType') && !!select.value);
            rows.forEach((row,i) => row.setAttribute('aria-selected',String(i === select.selectedIndex)));
            if (select.disabled) close();
        }
        function choose(index) {
            const changed = select.selectedIndex !== index;
            select.selectedIndex = index; sync(); close(true);
            if (changed) select.dispatchEvent(new Event('change',{bubbles:true}));
        }
        function move(direction) {
            let index = active;
            for (let i=0;i<options.length;i++) {
                index = (index + direction + options.length) % options.length;
                if (!options[index].disabled) { highlight(index); break; }
            }
        }
        trigger.addEventListener('click', () => open ? close() : show());
        trigger.addEventListener('keydown', event => {
            if (event.key === 'Tab') { close(); return; }
            if (event.key === 'Escape') {
                if (open) { event.preventDefault(); event.stopPropagation(); close(true); }
                return;
            }
            if (['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(event.key)) {
                event.preventDefault();
                if (!open) { show(); if(event.key === 'End') highlight(options.length-1); return; }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') move(event.key === 'ArrowDown' ? 1 : -1);
                else if (event.key === 'Home' || event.key === 'End') highlight(event.key === 'Home' ? 0 : options.length-1);
                else choose(active);
            } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault(); if (!open) show();
                const now = Date.now(); typed = now - typedAt > 650 ? event.key : typed + event.key; typedAt = now;
                const match = options.findIndex(option => !option.disabled && option.text.toLowerCase().startsWith(typed.toLowerCase()));
                if (match >= 0) highlight(match);
            }
        });
        panel.addEventListener('toggle', () => {
            // Read current state: toggle events may coalesce after rapid open/close.
            open = panel.matches(':popover-open');
            trigger.setAttribute('aria-expanded',String(open));
            if (!open) trigger.removeAttribute('aria-activedescendant');
        });
        trigger.addEventListener('blur', () => { if(open) close(); });
        select.addEventListener('change',sync);
        controls.set(select,{sync,close,position,isOpen:()=>open,panel}); sync();
    }
    function enhance(root = document) {
        for (const [select,control] of controls) if (!select.isConnected) { control.close(); controls.delete(select); }
        root.querySelectorAll('select').forEach(select => { if (!controls.has(select)) create(select); });
        sync();
    }
    function sync() { controls.forEach(control => control.sync()); }
    function close() { controls.forEach(control => control.close()); }
    window.addEventListener('resize',close);
    window.visualViewport?.addEventListener('resize',close);
    document.addEventListener('scroll',event => {
        controls.forEach(control => { if (control.isOpen() && !control.panel.contains(event.target)) control.close(); });
    },true);
    window.AnalyticsSelect = {enhance,sync,close};
})();
