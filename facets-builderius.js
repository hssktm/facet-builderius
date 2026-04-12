const cache = new Map();
const CACHE_LIMIT = 50;
let scrollObserver = null;

const applyStagger = (container) => {
    const items = container.querySelectorAll('[data-facet-animation]');
    Array.from(items)
        .filter(el => !el.style.getPropertyValue('--animation-child-facet'))
        .forEach((el, i) => el.style.setProperty('--animation-child-facet', i));
};

const getUrlState = () => {
    const url = new URL(window.location.href);
    const cleanPath = url.pathname.replace(/\/page\/\d+\/?/, '/');
    return {
        params: new URLSearchParams(url.search),
        pathValue: cleanPath.split('/').filter(Boolean).at(-1)?.toLowerCase() ?? null,
    };
};

const syncGroup = (group, params, pathValue) => {
    group.querySelectorAll('input, select, a, option, button').forEach(el => {
        let name, value;

        const href = el.getAttribute('href');
        if (href) {
            const u = new URL(href, window.location.origin);
            name = u.searchParams.keys().next().value;
            if (name) {
                value = u.searchParams.get(name);
            } else {
                const parts = u.pathname.split('/').filter(Boolean);
                name = parts.at(-2) ?? null;
                value = parts.at(-1) ?? null;
            }
        } else if (el.tagName === 'OPTION') {
            name = el.closest('select')?.name;
            value = el.value;
        } else {
            name = el.name;
            value = el.value;
        }

        const slug = value?.toLowerCase().replace(/\s+/g, '-') ?? '';

        if (!name) {
            if (el.tagName === 'A' || el.tagName === 'BUTTON') {
                el.classList.toggle('is-active', !!slug && pathValue === slug);
            }
            return;
        }

        const paramValue = params.get(name);
        const activeValues = paramValue
            ? paramValue.toLowerCase().split(',').map(v => v.replace(/\s+/g, '-'))
            : [];
        const isActive = activeValues.includes(slug) || pathValue === slug;

        if (el.tagName === 'INPUT') {
            if (el.type === 'checkbox' || el.type === 'radio') {
                el.checked = isActive;
            } else if (['number', 'range', 'text', 'search'].includes(el.type)) {
                el.value = paramValue || (el.type === 'range' ? el.min : '');
            }
        } else if (el.tagName === 'OPTION') {
            el.selected = isActive;
        } else if (el.tagName === 'SELECT' && !el.multiple) {
            if (isActive || (paramValue && el.value === paramValue)) el.value = paramValue || value;
            else if (!paramValue) el.selectedIndex = 0;
        } else {
            el.classList.toggle('is-active', isActive);
        }
    });
};

const syncInputs = () => {
    const { params, pathValue } = getUrlState();
    document.querySelectorAll('[data-facet-type]').forEach(group => syncGroup(group, params, pathValue));
};

const observeCollections = () => {
    document.querySelectorAll('[has="collection"]').forEach(el => {
        new MutationObserver(() => {
            const { params, pathValue } = getUrlState();
            syncGroup(el, params, pathValue);
        }).observe(el, { childList: true, subtree: true });
    });
};

const syncMoreVisibility = () => {
    document.querySelectorAll('[data-facet-type="more"], [data-facet-type="more-scroll"]').forEach(el => {
        const link = el.querySelector('a');
        el.style.display = (!link || !link.getAttribute('href')) ? 'none' : '';
    });
};

const initInfiniteScroll = () => {
    scrollObserver?.disconnect();
    scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const link = entry.target.querySelector('a');
            if (link?.href && !document.querySelector('.is-loading')) {
                updateContent(link.href, link);
            }
        });
    }, { rootMargin: '200px' });

    document.querySelectorAll('[data-facet-type="more-scroll"]').forEach(el => {
        scrollObserver.observe(el);
    });
};

const scrollToFacetTop = (trigger, container, facetType, facetAttr) => {
    if (['more', 'more-scroll'].includes(facetType)) return;

    const triggerGroup = trigger?.closest('[data-facet-type]');
    const sibling = facetAttr
        ? Array.from(document.querySelectorAll(`[data-facet="${facetAttr}"][data-facet-top]`)).at(0)
        : null;

    const source = (triggerGroup?.hasAttribute('data-facet-top') ? triggerGroup : null)
        ?? trigger?.closest('[data-facet-top]')
        ?? (container?.hasAttribute('data-facet-top') ? container : null)
        ?? sibling
        ?? container?.closest('[data-facet-top]');

    if (!source) return;

    const offset = parseInt(source.getAttribute('data-facet-top'), 10) || 0;
    window.scrollTo({ top: source.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
};

const isDynamic = (el) => el.closest('[data-facet]')?.getAttribute('data-facet-dynamic') !== 'false';

const getFacetRoot = (el) => el.closest('[data-facet]');

const getFacetType = (el) => el.closest('[data-facet-type]')?.getAttribute('data-facet-type') ?? null;

const cleanPaginationFromUrl = (rawUrl) => {
    const url = new URL(rawUrl, window.location.origin);
    const paged = url.searchParams.get('paged');
    if (!paged) return url.toString();

    url.searchParams.delete('paged');

    if (/\/page\/\d+\/?/.test(url.pathname)) {
        url.pathname = url.pathname.replace(/\/page\/\d+\/?/, paged === '1' ? '/' : `/page/${paged}/`);
    } else if (paged !== '1') {
        url.pathname = url.pathname.replace(/\/?$/, `/page/${paged}/`);
    }

    return url.toString();
};

const updateContent = async (url, trigger = null) => {
    const facet = getFacetRoot(trigger) ?? document.querySelector('[data-facet]');
    if (!facet) return;

    const facetAttr = facet.getAttribute('data-facet');
    const facetType = trigger ? getFacetType(trigger) : null;
    const selector = /^[.#]/.test(facetAttr) ? facetAttr : `[${facetAttr}]`;
    const container = document.querySelector(selector);
    if (!container) return;

    container.classList.add('is-loading');

    const applyUpdate = (type, data, layouts) => {
        const isAppend = ['more', 'more-scroll'].includes(facetType);
        const isCollection = container.getAttribute('has') === 'collection';

        if (isAppend) {
            if (isCollection) {
                const merged = [
                    ...JSON.parse(container.getAttribute('data-b-context') || '[]'),
                    ...JSON.parse(data || '[]'),
                ];
                container.setAttribute('data-b-context', JSON.stringify(merged));
            } else if (isDynamic(container)) {
                const temp = document.createElement('div');
                temp.innerHTML = data;
                while (temp.firstChild) container.appendChild(temp.firstChild);
            }
        } else if (isDynamic(container)) {
            if (isCollection) container.setAttribute('data-b-context', data);
            else container.innerHTML = data;
        }

        document.querySelectorAll('[data-facet-type]').forEach((el, i) => {
            if (!isDynamic(el)) return;

            const elType = el.getAttribute('data-facet-type');

            if (layouts[i]?.type === elType) {
                if (layouts[i].isCollection) {
                    el.setAttribute('data-b-context', layouts[i].bContext);
                } else {
                    el.innerHTML = layouts[i].content;
                }
            } else if (
                ['more', 'more-scroll', 'pagination'].includes(elType) &&
                !['more', 'more-scroll', 'search', 'filter-single', 'filter-multiple', 'submit', 'reset'].includes(facetType)
            ) {
                el.innerHTML = '';
            }
        });

        requestAnimationFrame(() => {
            syncInputs();
            applyStagger(container);
            container.classList.remove('is-loading');
            initInfiniteScroll();
            syncMoreVisibility();
            observeCollections();
            scrollToFacetTop(trigger, container, facetType, facetAttr);
        });
    };

    const isCacheable = !['search', 'more-scroll', 'filter-single', 'filter-multiple'].includes(facetType);
    if (isCacheable && cache.has(url)) {
        container.querySelectorAll('[data-facet-animation]').forEach(el => el.style.removeProperty('--animation-child-facet'));
        const { type, mainData, layouts } = cache.get(url);
        setTimeout(() => applyUpdate(type, mainData, layouts), 150);
        return;
    }

    try {
        const html = await fetch(url).then(r => r.text());
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const newElement = doc.querySelector(selector);
        if (!newElement) return;

        const layouts = Array.from(doc.querySelectorAll('[data-facet-type]')).map(el => ({
            type: el.getAttribute('data-facet-type'),
            isCollection: el.getAttribute('has') === 'collection',
            bContext: el.getAttribute('data-b-context'),
            content: el.innerHTML,
        }));

        const type = container.getAttribute('has') === 'collection' ? 'json' : 'html';
        const mainData = type === 'json'
            ? newElement.getAttribute('data-b-context')
            : newElement.innerHTML;

        cache.set(url, { type, mainData, layouts });
        if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);

        applyUpdate(type, mainData, layouts);
    } catch {
        container.classList.remove('is-loading');
    }
};

const buildFilterUrl = (name, value, facetType, facetRoot) => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    let pathname = url.pathname.replace(/\/page\/\d+\/?/, '/');
    params.delete('paged');

    const pathParts = pathname.split('/').filter(Boolean);
    if (pathParts.at(-2) === name) {
        if (!params.has(name)) params.set(name, pathParts.at(-1));
        pathname = pathname.replace(new RegExp(`${name}\\/[^\\/]+\\/?$`), '');
    }

    if (facetType === 'filter-multiple') {
        const incoming = value.split(',');
        let current = params.get(name)?.split(',').filter(Boolean) ?? [];
        incoming.forEach(v => {
            current = current.includes(v) ? current.filter(x => x !== v) : [...current, v];
        });
        if (current.length) params.set(name, [...new Set(current)].join(','));
        else params.delete(name);
    } else {
        if (!value || params.get(name) === value) params.delete(name);
        else params.set(name, value);
    }

    const groupNames = Array.from(facetRoot.querySelectorAll('[name]')).map(el => el.name);
    const ordered = new URLSearchParams();
    const seen = new Set();

    params.forEach((val, key) => {
        if (seen.has(key)) return;
        if (groupNames.includes(key)) {
            groupNames.forEach(gk => {
                if (!seen.has(gk) && params.has(gk)) {
                    ordered.set(gk, params.get(gk));
                    seen.add(gk);
                }
            });
        } else {
            ordered.set(key, val);
            seen.add(key);
        }
    });

    return `${pathname}${ordered.toString() ? '?' + ordered.toString() : ''}`;
};

const applyFilter = async (name, value, facetType, trigger) => {
    const facetRoot = getFacetRoot(trigger);
    if (!facetRoot) return;
    if (facetRoot.getAttribute('data-facet-mode') === 'submit') return;

    const newUrl = buildFilterUrl(name, value, facetType, facetRoot);
    await updateContent(newUrl, trigger);
    window.history.pushState({ url: newUrl }, '', newUrl);
};

document.addEventListener('change', async (e) => {
    const el = e.target;
    const group = el.closest('[data-facet-type^="filter-"]');
    if (!group) return;

    const facetType = group.getAttribute('data-facet-type');

    if (el.tagName === 'SELECT' && el.multiple) {
        const value = Array.from(el.selectedOptions).map(o => o.value).join(',');
        await applyFilter(el.name, value, 'filter-multiple', el);
    } else {
        await applyFilter(el.name, el.value, facetType, el);
    }
});

document.addEventListener('click', async (e) => {
    const el = e.target;

    const resetBtn = el.closest('[data-facet-type="reset"]');
    if (resetBtn) {
        e.preventDefault();
        const facetRoot = getFacetRoot(resetBtn);
        if (!facetRoot) return;

        const url = new URL(window.location.href);
        const params = new URLSearchParams(url.search);
        let pathname = url.pathname.replace(/\/page\/\d+\/?/, '/');
        params.delete('paged');

        [...new Set(Array.from(facetRoot.querySelectorAll('[name]')).map(el => el.name))].forEach(name => {
            params.delete(name);
            pathname = pathname.replace(new RegExp(`${name}\\/[^\\/]+\\/?$`, 'i'), '');
        });

        const newUrl = `${pathname}${params.toString() ? '?' + params.toString() : ''}`;
        await updateContent(newUrl, resetBtn);
        window.history.pushState({ url: newUrl }, '', newUrl);
        return;
    }

    const submitBtn = el.closest('[data-facet-type="submit"]');
    if (submitBtn) {
        e.preventDefault();
        const facetRoot = getFacetRoot(submitBtn);
        if (!facetRoot) return;

        const url = new URL(window.location.href);
        const params = new URLSearchParams(url.search);
        let pathname = url.pathname.replace(/\/page\/\d+\/?/, '/');
        params.delete('paged');
        const seen = new Set();

        facetRoot.querySelectorAll('[name]').forEach(input => {
            const { name } = input;
            if (seen.has(name)) return;
            seen.add(name);
            pathname = pathname.replace(new RegExp(`${name}\\/[^\\/]+\\/?$`, 'i'), '');

            if (input.type === 'checkbox' || input.type === 'radio') {
                const checked = Array.from(facetRoot.querySelectorAll(`input[name="${name}"]:checked`)).map(i => i.value);
                if (checked.length) params.set(name, checked.join(','));
                else params.delete(name);
            } else if (input.tagName === 'SELECT' && input.multiple) {
                const selected = Array.from(input.selectedOptions).map(o => o.value);
                if (selected.length) params.set(name, selected.join(','));
                else params.delete(name);
            } else {
                if (input.value) params.set(name, input.value);
                else params.delete(name);
            }
        });

        const newUrl = `${pathname}${params.toString() ? '?' + params.toString() : ''}`;
        await updateContent(newUrl, submitBtn);
        window.history.pushState({ url: newUrl }, '', newUrl);
        return;
    }

    const actionEl = el.closest('a, button');
    if (!actionEl) return;

    if (
        actionEl.tagName === 'BUTTON' &&
        (actionEl.type === 'submit' || actionEl.type === 'reset') &&
        !actionEl.hasAttribute('data-facet-type') &&
        !actionEl.closest('[data-facet-type]')
    ) return;

    const facetRoot = getFacetRoot(actionEl);
    if (!facetRoot) return;

    const group = actionEl.closest('[data-facet-type]');
    const facetType = group?.getAttribute('data-facet-type') ?? facetRoot.getAttribute('data-facet-type');
    if (!facetType || facetType === 'search') return;

    const isSubmitMode = facetRoot.getAttribute('data-facet-mode') === 'submit';

    if (facetType.startsWith('filter-')) {
        e.preventDefault();

        if (isSubmitMode) {
            actionEl.classList.toggle('is-active');
            return;
        }

        const href = actionEl.getAttribute('href');
        if (href) {
            const u = new URL(href, window.location.origin);
            const name = u.searchParams.keys().next().value;
            const value = u.searchParams.get(name);

            if (name && value) {
                await applyFilter(name, value, facetType, actionEl);
            } else {
                const parts = u.pathname.split('/').filter(Boolean);
                if (parts.length >= 2) await applyFilter(parts.at(-2), parts.at(-1), facetType, actionEl);
            }
        } else if (actionEl.name && actionEl.value) {
            await applyFilter(actionEl.name, actionEl.value, facetType, actionEl);
        }

        return;
    }

    if (facetType === 'single') {
        e.preventDefault();
        const href = actionEl.getAttribute('href') || actionEl.href;
        await updateContent(href, actionEl);
        window.history.pushState({ url: href }, '', href);
        return;
    }

    const href = actionEl.getAttribute('href') || actionEl.href;
    if (!href) return;
    e.preventDefault();
    const cleanHref = cleanPaginationFromUrl(href);
    await updateContent(cleanHref, actionEl);
    if (!['more', 'more-scroll'].includes(facetType)) {
        window.history.pushState({ url: cleanHref }, '', cleanHref);
    }
});

document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-facet-type="search"]');
    if (!form) return;

    e.preventDefault();
    const params = new URLSearchParams(new FormData(form));
    for (const [key, value] of [...params]) {
        if (!value?.trim()) params.delete(key);
    }

    const base = form.action.endsWith('/') ? form.action : `${form.action}/`;
    const url = params.toString() ? `${base}?${params}` : base;
    await updateContent(url, form);
    window.history.pushState({ url }, '', url);
});

window.addEventListener('popstate', () => {
    updateContent(window.location.href);
    syncInputs();
});

document.addEventListener('DOMContentLoaded', () => {
    initInfiniteScroll();
    syncInputs();
    syncMoreVisibility();
    observeCollections();
});
