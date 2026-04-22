const cache = new Map();
const filterRegistry = new Map();
const validSlugsMap = new Map();
const CACHE_LIMIT = 50;
let scrollObserver = null;
let childScrollObserver = null;

const applyStagger = (container, isAppend = false, isInitial = false) => {
    const animAttr = container.getAttribute('data-facet-animation') || '';
    const isScroll = animAttr.startsWith('scroll:');

    if (isScroll && !childScrollObserver) {
        childScrollObserver = new IntersectionObserver((entries) => {
            let delayIndex = 0;
            entries.forEach(entry => {
                if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
                    const el = entry.target;
                    el.style.setProperty('--animation-child-facet', delayIndex);
                    el.setAttribute('data-facet-animated', 'true');
                    delayIndex++;
                    childScrollObserver.unobserve(el);
                }
            });
        }, { rootMargin: '0px' });
    }

    const items = Array.from(container.querySelectorAll('[data-facet-animation-child]'));
    if (items.length === 0) return;
    if (isAppend) {
        let newItemsCounter = 0;
        items.forEach((el) => {
            if (el._facetWasPresent || el.hasAttribute('data-facet-old')) {
                el.style.setProperty('--animation-child-facet', '-1');
                el.style.animation = 'none';
                el.style.opacity = '1';
                el.style.visibility = 'visible';
                el.style.transform = 'none';
                el.setAttribute('data-facet-animated', 'true');
                if (isScroll) childScrollObserver.unobserve(el);
            } else {
                if (isScroll) {
                    el.setAttribute('data-facet-animated', 'false');
                    childScrollObserver.observe(el);
                } else {
                    el.style.setProperty('--animation-child-facet', newItemsCounter);
                    el.setAttribute('data-facet-animated', 'true');
                    newItemsCounter++;
                }
            }
        });
    } else {
        items.forEach((el, index) => {
            el.style.setProperty('--animation-child-facet', index);
            el._facetWasPresent = false;
            el.removeAttribute('data-facet-old');
            if (isScroll) {
                el.setAttribute('data-facet-animated', 'false');
                childScrollObserver.observe(el);
            } else {
                el.setAttribute('data-facet-animated', 'true');
            }
        });
    }
    container.classList.remove('is-entering', 'is-load');
    void container.offsetWidth;
    if (isInitial) {
        container.classList.add('is-load');
    } else {
        container.classList.add('is-entering');
    }
};

const parseFacetValue = (name, value) => {
    if (!value) return new URLSearchParams();
    let qs = value;
    if (name) {
        const firstPart = value.split('&')[0];
        if (!firstPart.includes('=')) {
            qs = `${name}=${value}`;
        }
    }
    return new URLSearchParams(qs);
};

const getGroupKeys = (group) => {
    const keys = new Set();
    const facetName = group?.getAttribute('data-facet-name');
    if (facetName) keys.add(facetName);
    if (!group) return Array.from(keys);

    group.querySelectorAll('input, select, a, option, button, [name][value]').forEach(el => {
        let n = el.tagName === 'OPTION' ? el.closest('select')?.name : (el.name || el.getAttribute('name'));
        let v = el.tagName === 'OPTION' ? el.value : (el.value || el.getAttribute('value'));

        if (el.hasAttribute('href')) {
            const href = el.getAttribute('href');
            if (href && href !== '#' && !href.startsWith('javascript:')) {
                try {
                    const u = new URL(href, window.location.origin);
                    for (const k of u.searchParams.keys()) keys.add(k);
                } catch (e) { }
            }
        } else if (v) {
            if (n) keys.add(n);
            const parsed = parseFacetValue(n, v);
            for (const k of parsed.keys()) keys.add(k);
        }
    });
    return Array.from(keys);
};

const normalizeValue = (name, value) => {
    if (value === null || value === undefined) return value;
    const stringVal = String(value);
    const map = validSlugsMap.get(name);
    if (map) {
        if (map.has(stringVal)) return map.get(stringVal);
        if (map.has(stringVal.toLowerCase())) return map.get(stringVal.toLowerCase());
        const slugified = stringVal.toLowerCase().replace(/\s+/g, '-');
        if (map.has(slugified)) return map.get(slugified);
    }
    return stringVal;
};

const getUnifiedState = () => {
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const state = new Map();
    let basePathParts = [];

    params.forEach((val, key) => {
        if (key === 'paged' || key === 'page') return;
        const values = val.split(',').filter(Boolean).map(v => normalizeValue(key, v));
        if (values.length) state.set(key, new Set(values));
    });

    const facetNodes = Array.from(document.querySelectorAll('[data-facet-name]'));
    const registeredFacetNames = new Set(facetNodes.map(el => el.getAttribute('data-facet-name').toLowerCase()));

    const singleFacetNames = new Set(facetNodes.filter(el => el.getAttribute('data-facet-type') === 'single').map(el => el.getAttribute('data-facet-name').toLowerCase()));

    for (let i = 0; i < pathParts.length; i++) {
        const pathPart = pathParts[i].toLowerCase();
        if (pathPart === 'page') { i++; continue; }

        const possibleKeys = [pathPart, pathPart + '_name', pathPart.replace(/-/g, '_'), pathPart.replace(/-/g, '_') + '_name'];
        const isFacet = possibleKeys.some(k => registeredFacetNames.has(k) || validSlugsMap.has(k));

        if (isFacet && i < pathParts.length - 1) {
            const matchingGroup = facetNodes.find(g => possibleKeys.includes(g.getAttribute('data-facet-name')?.toLowerCase()));
            const finalKey = matchingGroup?.getAttribute('data-facet-name') || pathPart;
            const pathValue = pathParts[i + 1];

            if (!state.has(finalKey)) state.set(finalKey, new Set());
            state.get(finalKey).add(normalizeValue(finalKey, pathValue));
            i++;

            if (singleFacetNames.has(finalKey.toLowerCase())) {
                const controlKeys = new Set();
                document.querySelectorAll('[data-facet-type^="control-"]').forEach(g => {
                    getGroupKeys(g).forEach(k => controlKeys.add(k));
                });

                const keysToDrop = [];
                params.forEach((v, k) => {
                    if (k !== 'page' && k !== 'paged' && !controlKeys.has(k)) {
                        keysToDrop.push(k);
                    }
                });
                keysToDrop.forEach(k => {
                    params.delete(k);
                    state.delete(k);
                });
            }
            continue;
        }
        basePathParts.push(pathParts[i]);
    }

    const basePath = '/' + (basePathParts.length ? basePathParts.join('/') + '/' : '');
    return { state, basePath, params, basePathParts };
};

const parseChipsParams = (str) => {
    if (!str) return {};
    return str.split(',').reduce((acc, pair) => {
        const [key, ...val] = pair.split(':');
        if (key) acc[key.trim()] = val.join(':').trim();
        return acc;
    }, {});
};

const updateFilterRegistry = () => {
    const filters = document.querySelectorAll('[data-facet-type^="filter-"], [data-facet-type^="control-"], [data-facet-type="single"], [data-facet-type="search"]');

    filters.forEach(group => {
        const groupName = group.getAttribute('data-facet-name');
        group.querySelectorAll('input, select, a, option, button, [name][value]').forEach(el => {
            let name, value;
            if (el.tagName === 'OPTION') {
                name = el.closest('select')?.name;
                value = el.value;
            } else {
                name = el.name || el.getAttribute('name');
                value = el.value || el.getAttribute('value');
            }
            if (!name) return;
            const visualName = groupName || name;
            if (!validSlugsMap.has(visualName)) validSlugsMap.set(visualName, new Map());
            const map = validSlugsMap.get(visualName);
            const stringVal = String(value || '');
            if (stringVal) {
                map.set(stringVal.toLowerCase().replace(/\s+/g, '-'), stringVal);
                map.set(stringVal.toLowerCase(), stringVal);
                map.set(stringVal, stringVal);
            }
        });
    });

    filters.forEach(group => {
        const groupName = group.getAttribute('data-facet-name');
        const isSearch = group.getAttribute('data-facet-type') === 'search';
        const groupKeys = getGroupKeys(group);

        group.querySelectorAll('input, select, a, option, button, [name][value]').forEach(el => {
            let name, value;
            if (el.tagName === 'OPTION') {
                name = el.closest('select')?.name;
                value = el.value;
            } else {
                name = el.name || el.getAttribute('name');
                value = el.value || el.getAttribute('value');
            }
            if (!name) return;
            const visualName = groupName || name;
            const { state } = getUnifiedState();
            const currentStateValue = state.get(visualName) ? Array.from(state.get(visualName))[0] : null;
            const finalValue = (isSearch && currentStateValue) ? currentStateValue : value;
            if (finalValue === undefined || finalValue === null) return;

            const stringVal = String(finalValue);
            const key = `${name}:${stringVal.toLowerCase()}`;
            const label = el.tagName === 'INPUT'
                ? (document.querySelector(`label[for="${el.id}"]`)?.textContent || stringVal)
                : (el.textContent || stringVal);
            const params = parseChipsParams(el.getAttribute('data-facet-chips-params'));

            let itemParams = new URLSearchParams();
            const href = el.getAttribute('href');
            if (href && href !== '#' && !href.startsWith('javascript:')) {
                try {
                    const u = new URL(href, window.location.origin);
                    const searchStr = u.search.replace(/^\?/, '');
                    if (searchStr) {
                        itemParams = new URLSearchParams(searchStr);
                    } else {
                        const parts = u.pathname.split('/').filter(Boolean);
                        itemParams.append(parts.at(-2) || visualName, parts.at(-1) || stringVal);
                    }
                } catch (e) { }
            } else {
                itemParams = parseFacetValue(visualName, stringVal);
            }

            if (!filterRegistry.has(key) || Object.keys(params).length > 0) {
                const existing = filterRegistry.get(key) || {};
                filterRegistry.set(key, {
                    name,
                    value: stringVal,
                    label: label.trim(),
                    groupKeys: groupKeys,
                    parsedParams: itemParams,
                    ...existing,
                    ...params
                });
            }
        });
    });
};

const markExistingItems = (container) => {
    container.querySelectorAll('[data-facet-animation-child]').forEach(n => {
        n._facetWasPresent = true;
        n.setAttribute('data-facet-old', 'true');
    });
};

const syncChips = () => {
    const { state } = getUnifiedState();
    const chipsContainers = document.querySelectorAll('[data-facet-chips]');
    if (!chipsContainers.length) return;
    const activeFilters = [];
    const processedParams = new Set();
    const facetNodes = Array.from(document.querySelectorAll('[data-facet-name]'));
    const validFacetNames = new Set(facetNodes.map(el => el.getAttribute('data-facet-name')));
    const singleTypeFacetNames = new Set();
    document.querySelectorAll('[data-facet-type="single"], [data-facet-type^="control-"]').forEach(el => {
        getGroupKeys(el).forEach(k => singleTypeFacetNames.add(k));
    });

    const isParamActive = (k, v) => {
        const norm = normalizeValue(k, v);
        return state.has(k) && state.get(k).has(norm);
    };

    const sortedRegistry = Array.from(filterRegistry.values()).sort((a, b) => {
        const aSize = a.parsedParams ? Array.from(a.parsedParams.keys()).length : 0;
        const bSize = b.parsedParams ? Array.from(b.parsedParams.keys()).length : 0;
        return bSize - aSize;
    });

    sortedRegistry.forEach(reg => {
        if (!reg.parsedParams || Array.from(reg.parsedParams.keys()).length === 0) return;
        if (singleTypeFacetNames.has(reg.name)) return;

        let isActive = true;
        reg.parsedParams.forEach((v, k) => {
            if (!isParamActive(k, v)) isActive = false;
        });

        if (isActive) {
            let alreadyProcessed = false;
            reg.parsedParams.forEach((v, k) => {
                if (processedParams.has(`${k}:${normalizeValue(k, v)}`)) alreadyProcessed = true;
            });

            if (!alreadyProcessed) {
                activeFilters.push({
                    name: reg.name,
                    value: reg.value,
                    label: reg.label,
                    slug: reg.value.toLowerCase().replace(/\s+/g, '-'),
                    ...reg
                });

                reg.parsedParams.forEach((v, k) => {
                    processedParams.add(`${k}:${normalizeValue(k, v)}`);
                });
            }
        }
    });

    state.forEach((values, name) => {
        if (singleTypeFacetNames.has(name)) return;
        if (!validFacetNames.has(name) && !Array.from(filterRegistry.values()).some(reg => reg.name === name)) return;
        values.forEach(v => {
            const normV = normalizeValue(name, v);
            const paramKey = `${name}:${normV}`;
            if (processedParams.has(paramKey)) return;

            const slug = normV.toLowerCase().replace(/\s+/g, '-');
            const cached = filterRegistry.get(`${name}:${normV.toLowerCase()}`) || filterRegistry.get(`${name}:${slug}`);

            activeFilters.push({
                name: name,
                value: normV,
                label: cached?.label || normV,
                slug: slug,
                ...(cached || {})
            });
        });
    });

    const jsonContext = JSON.stringify(activeFilters);
    chipsContainers.forEach(container => {
        const isCollection = container.getAttribute('has') === 'collection' || container.hasAttribute('data-b-context');
        if (isCollection) {
            if (container.getAttribute('data-b-context') !== jsonContext) {
                container.setAttribute('data-b-context', jsonContext);
            }
        } else {
            container.innerHTML = activeFilters.map(f => `<button data-facet-name="${f.name}" value="${f.value}">${f.label}</button>`).join('');
        }
    });
};

const syncGroup = (group) => {
    const { state } = getUnifiedState();
    const groupFacetName = group.getAttribute('data-facet-name');
    const elements = group.querySelectorAll('input, select, a, option, button, [name][value]');
    elements.forEach(el => {
        if (el.tagName === 'OPTION') return;

        let name, value;
        const href = el.getAttribute('href');
        if (href && href !== '#' && !href.startsWith('javascript:')) {
            try {
                const u = new URL(href, window.location.origin);
                const searchStr = u.search.replace(/^\?/, '');
                if (searchStr) {
                    value = searchStr;
                } else {
                    const parts = u.pathname.split('/').filter(Boolean);
                    name = parts.at(-2);
                    value = parts.length >= 2 ? parts.at(-1) : "";
                }
            } catch (e) { }
        } else {
            name = el.name || el.getAttribute('name');
            value = el.value || el.getAttribute('value');
        }

        const visualName = groupFacetName || name || '';
        let isActive = false;
        let isEmpty = (value === "" || value === null || value === undefined);

        let paramsToCheck = new URLSearchParams();
        if (!isEmpty) {
            if (href && href !== '#' && !href.startsWith('javascript:')) {
                try {
                    const u = new URL(href, window.location.origin);
                    const searchStr = u.search.replace(/^\?/, '');
                    if (searchStr) {
                        paramsToCheck = new URLSearchParams(searchStr);
                    } else {
                        const parts = u.pathname.split('/').filter(Boolean);
                        paramsToCheck.append(visualName || parts.at(-2), parts.length >= 2 ? parts.at(-1) : value);
                    }
                } catch (e) { }
            } else {
                paramsToCheck = parseFacetValue(visualName, String(value));
            }
        }

        if (isEmpty) {
            const groupKeys = getGroupKeys(group);
            isActive = true;
            groupKeys.forEach(k => {
                if (state.has(k) && state.get(k).size > 0) isActive = false;
            });
        } else {
            isActive = true;
            if (Array.from(paramsToCheck.keys()).length === 0) {
                isActive = false;
            } else {
                paramsToCheck.forEach((v, k) => {
                    const norm = normalizeValue(k, v);
                    if (!state.has(k) || !state.get(k).has(norm)) isActive = false;
                });
            }
        }

        if (el.tagName === 'INPUT') {
            if (el.type === 'checkbox' || el.type === 'radio') el.checked = isActive;
            else if (['number', 'range', 'text', 'search', 'date'].includes(el.type)) el.value = state.get(visualName) ? Array.from(state.get(visualName))[0] : '';
        } else if (el.tagName === 'SELECT') {
            if (el.multiple) {
                Array.from(el.options).forEach(opt => {
                    let optActive = false;
                    if (!opt.value) {
                        const groupKeys = getGroupKeys(group);
                        optActive = true;
                        groupKeys.forEach(k => { if (state.has(k) && state.get(k).size > 0) optActive = false; });
                    } else {
                        const optParams = parseFacetValue(el.name || visualName, opt.value);
                        optActive = true;
                        optParams.forEach((v, k) => {
                            const norm = normalizeValue(k, v);
                            if (!state.has(k) || !state.get(k).has(norm)) optActive = false;
                        });
                        if (Array.from(optParams.keys()).length === 0) optActive = false;
                    }
                    opt.selected = optActive;
                });
            } else {
                let foundActive = false;
                Array.from(el.options).forEach((opt, idx) => {
                    if (!opt.value) return;
                    const optParams = parseFacetValue(el.name || visualName, opt.value);
                    let optActive = true;
                    optParams.forEach((v, k) => {
                        const norm = normalizeValue(k, v);
                        if (!state.has(k) || !state.get(k).has(norm)) optActive = false;
                    });
                    if (Array.from(optParams.keys()).length === 0) optActive = false;
                    if (optActive) {
                        el.selectedIndex = idx;
                        foundActive = true;
                    }
                });
                if (!foundActive) el.selectedIndex = 0;
            }
        } else {
            el.classList.toggle('is-active', isActive);
        }
    });
};

const syncInputs = () => {
    updateFilterRegistry();
    document.querySelectorAll('[data-facet-type]').forEach(group => syncGroup(group));
    syncChips();
};

const waitForChildren = (container, isAppending, oldIds = { size: 0 }) => {
    let settled = false;
    const isScroll = (container.getAttribute('data-facet-animation') || '').startsWith('scroll:');
    const run = () => {
        if (settled) return;
        settled = true;
        applyStagger(container, isAppending, false);
    };
    const obs = new MutationObserver((mutations) => {
        if (isScroll) {
            mutations.forEach(m => {
                Array.from(m.addedNodes).forEach(n => {
                    if (n.nodeType === 1) {
                        if (n.matches && n.matches('[data-facet-animation-child]')) n.setAttribute('data-facet-animated', 'false');
                        if (n.querySelectorAll) n.querySelectorAll('[data-facet-animation-child]').forEach(c => c.setAttribute('data-facet-animated', 'false'));
                    }
                });
            });
        }
        obs.disconnect();
        if (isAppending && oldIds.size > 0) {
            const items = Array.from(container.querySelectorAll('[data-facet-animation-child]'));
            items.slice(0, oldIds.size).forEach(el => { el._facetWasPresent = true; el.setAttribute('data-facet-old', 'true'); });
        }
        requestAnimationFrame(run);
    });
    obs.observe(container, { childList: true, subtree: true });
    requestAnimationFrame(() => requestAnimationFrame(run));
};

const observeCollections = () => {
    document.querySelectorAll('[data-facet-chips][has="collection"], [has="collection"]').forEach(el => {
        if (!el._facetObserved) {
            const observer = new MutationObserver((mutations) => {
                let contextChanged = false;
                mutations.forEach(m => {
                    if (m.type === 'attributes' && m.attributeName === 'data-b-context') contextChanged = true;
                });
                if (!contextChanged) return;
                syncGroup(el);
            });
            observer.observe(el, { attributes: true, attributeFilter: ['data-b-context'] });
            el._facetObserved = true;
        }
    });
};

const syncMoreVisibility = () => {
    document.querySelectorAll('[data-facet-type]').forEach(el => {
        const type = el.getAttribute('data-facet-type');
        if (type !== 'more' && !isMoreScrollType(type)) return;
        const link = el.querySelector('a');
        el.style.display = (!link || !link.getAttribute('href')) ? 'none' : '';
    });
};

const getScrollLimit = (el) => {
    const type = el.getAttribute('data-facet-type') ?? '';
    const match = type.match(/^more-scroll:(\d+)$/);
    return match ? parseInt(match[1], 10) : Infinity;
};

const isMoreScrollType = (type) => type === 'more-scroll' || /^more-scroll:\d+$/.test(type);

const initInfiniteScroll = () => {
    scrollObserver?.disconnect();
    scrollObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            const link = el.querySelector('a');
            if (link?.href && !document.querySelector('.is-loading') && !document.querySelector('.is-loading-more')) {
                const count = parseInt(el.getAttribute('data-scroll-count') || '0', 10);
                el.setAttribute('data-scroll-count', count + 1);
                updateContent(link.href, link);
            }
        });
    }, { rootMargin: '200px' });
    document.querySelectorAll('[data-facet-type]').forEach(el => {
        if (isMoreScrollType(el.getAttribute('data-facet-type'))) {
            const limit = getScrollLimit(el);
            const count = parseInt(el.getAttribute('data-scroll-count') || '0', 10);
            if (count < limit) scrollObserver.observe(el);
        }
    });
};

const isDynamic = (el) => el.closest('[data-facet]')?.getAttribute('data-facet-dynamic') !== 'false';
const getFacetRoot = (el) => el.closest('[data-facet]');
const getFacetType = (el) => el.closest('[data-facet-type]')?.getAttribute('data-facet-type') ?? null;

const cleanPaginationFromUrl = (targetUrl) => {
    const url = new URL(targetUrl, window.location.origin);
    const pagedParam = url.searchParams.get("paged") || url.searchParams.get("page");
    const pathMatch = url.pathname.match(/\/page\/(\d+)\/?/i);
    const paged = pagedParam || (pathMatch ? pathMatch[1] : null);
    if (!paged) return targetUrl;
    const currentUrl = new URL(window.location.href);
    let path = currentUrl.pathname.replace(/\/page\/\d+\/?/i, '/');
    if (!path.endsWith('/')) path += '/';
    const finalPath = paged === "1" ? path : `${path}page/${paged}/`;
    const finalParams = new URLSearchParams(currentUrl.search);
    finalParams.delete("paged");
    finalParams.delete("page");
    const qs = finalParams.toString();
    return `${window.location.origin}${finalPath}${qs ? '?' + qs : ''}`;
};

const updateContent = async (url, trigger = null) => {
    const isPopstate = trigger === 'popstate';
    const facet = (trigger && !isPopstate) ? getFacetRoot(trigger) : document.querySelector('[data-facet]');
    if (!facet) return;
    const facetAttr = facet.getAttribute('data-facet');
    const facetType = (trigger && !isPopstate) ? getFacetType(trigger) : null;
    const selector = /^[.#]/.test(facetAttr) ? facetAttr : `[${facetAttr}]`;
    const container = document.querySelector(selector);
    if (!container) return;
    let shouldScroll = false;
    let scrollOffset = 0;
    if (trigger && !isPopstate) {
        const topTrigger = trigger.closest('[data-facet-top]');
        if (topTrigger) {
            shouldScroll = true;
            scrollOffset = parseInt(topTrigger.getAttribute('data-facet-top'), 10) || 0;
            const targetY = container.getBoundingClientRect().top + window.scrollY;
            const finalY = Math.max(0, targetY - scrollOffset);
            if (Math.abs(finalY - window.scrollY) > 10) {
                window.scrollTo({ top: finalY, behavior: 'smooth' });
            }
        }
    }
    const allFacetGroups = document.querySelectorAll('[data-facet-type]');
    const delayVar = getComputedStyle(container).getPropertyValue('--delay-facet').trim();
    const rawAnim = container.getAttribute('data-facet-animation') || '';
    const animVal = rawAnim.startsWith('scroll:') ? rawAnim.split(':')[1] : rawAnim;
    const animTime = delayVar ? (parseFloat(delayVar) * (delayVar.endsWith('ms') ? 1 : 1000)) : (parseInt(animVal, 10) || 0);
    const isAppend = facetType === 'more' || isMoreScrollType(facetType);
    const isCollection = container.getAttribute('has') === 'collection';
    if (!isAppend) {
        container.classList.remove('is-entering', 'is-load');
        container.classList.add('is-exiting');
        if (animTime > 0) await new Promise(r => setTimeout(r, animTime));
        container.classList.remove('is-exiting');
    }
    allFacetGroups.forEach(el => el.classList.add('is-loading'));
    if (isAppend) container.classList.add('is-loading-more');
    else container.classList.add('is-loading');

    const applyUpdate = (type, data, layouts) => {
        if (isAppend) {
            if (isCollection) {
                const oldCount = container.querySelectorAll('[data-facet-animation-child]').length;
                const currentData = JSON.parse(container.getAttribute('data-b-context') || '[]');
                const newData = JSON.parse(data || '[]');
                container.setAttribute('data-b-context', JSON.stringify([...currentData, ...newData]));
                waitForChildren(container, true, { size: oldCount });
            } else if (isDynamic(container)) {
                markExistingItems(container);
                const temp = document.createElement('div');
                temp.innerHTML = data;
                while (temp.firstChild) {
                    if (temp.firstChild.nodeType === 1) temp.firstChild._facetWasPresent = false;
                    container.appendChild(temp.firstChild);
                }
                applyStagger(container, true, false);
            }
        } else {
            document.querySelectorAll('[data-facet-type]').forEach(el => {
                if (isMoreScrollType(el.getAttribute('data-facet-type'))) el.setAttribute('data-scroll-count', '0');
            });
            if (isDynamic(container)) {
                if (isCollection) {
                    container.setAttribute('data-b-context', data);
                    waitForChildren(container, false);
                } else {
                    container.innerHTML = data;
                    applyStagger(container, false, false);
                }
            }
        }
        document.querySelectorAll('[data-facet-type]').forEach((el, i) => {
            if (!isDynamic(el) || el === container) return;
            const elType = el.getAttribute('data-facet-type');
            if (layouts[i]?.type === elType) {
                if (layouts[i].isCollection) {
                    if (el.getAttribute('data-b-context') !== layouts[i].bContext) {
                        markExistingItems(el);
                        el.getAttribute('data-b-context') !== layouts[i].bContext && el.setAttribute('data-b-context', layouts[i].bContext);
                    }
                } else {
                    el.innerHTML = layouts[i].content;
                    applyStagger(el, false, false);
                }
            } else if ((elType === 'more' || isMoreScrollType(elType) || elType === 'pagination') && !['more', 'search', 'filter-single', 'filter-multiple', 'filter-multiiple', 'control-single', 'control-multiple', 'submit', 'reset'].includes(facetType) && !isMoreScrollType(facetType)) {
                el.innerHTML = '';
            }
        });
        requestAnimationFrame(() => {
            syncInputs();
            allFacetGroups.forEach(el => el.classList.remove('is-loading', 'is-loading-more'));
            container.classList.remove('is-loading');
            initInfiniteScroll();
            syncMoreVisibility();
            observeCollections();
        });
    };

    const isCacheable = !['search', 'filter-single', 'filter-multiple', 'filter-multiiple', 'control-single', 'control-multiple'].includes(facetType) && !isMoreScrollType(facetType) && !isPopstate;
    if (isCacheable && cache.has(url)) {
        const { type, mainData, layouts } = cache.get(url);
        applyUpdate(type, mainData, layouts);
        return;
    }

    try {
        const html = await fetch(url).then(r => r.text());
        const doc = new DOMParser().parseFromString(html, 'text/html');

        doc.querySelectorAll('[data-facet-animation^="scroll:"]').forEach(c => {
            c.querySelectorAll('[data-facet-animation-child]').forEach(child => {
                child.setAttribute('data-facet-animated', 'false');
            });
        });

        const newElement = doc.querySelector(selector);
        if (!newElement) {
            allFacetGroups.forEach(el => el.classList.remove('is-loading', 'is-loading-more'));
            container.classList.remove('is-loading');
            return;
        }
        const layouts = Array.from(doc.querySelectorAll('[data-facet-type]')).map(el => ({
            type: el.getAttribute('data-facet-type'),
            isCollection: el.getAttribute('has') === 'collection' || el.hasAttribute('data-b-context'),
            bContext: el.getAttribute('data-b-context'),
            content: el.innerHTML,
        }));
        const type = isCollection ? 'json' : 'html';
        const mainData = isCollection ? newElement.getAttribute('data-b-context') : newElement.innerHTML;
        if (isCacheable) {
            cache.set(url, { type, mainData, layouts });
            if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
        }
        applyUpdate(type, mainData, layouts);
    } catch {
        allFacetGroups.forEach(el => el.classList.remove('is-loading', 'is-loading-more'));
        container.classList.remove('is-loading');
    }
};

const buildFilterUrl = (name, value, facetType, trigger, facetName = null, isControl = false) => {
    const { state, basePath, params } = getUnifiedState();

    const group = trigger ? trigger.closest('[data-facet-type]') : null;
    const groupKeys = getGroupKeys(group);

    const visualName = facetName || name || '';
    if (visualName && !groupKeys.includes(visualName)) groupKeys.push(visualName);

    const isMulti = facetType === 'filter-multiple' || facetType === 'filter-multiiple' || facetType === 'control-multiple';

    if (facetType === 'single') {
        const href = trigger?.getAttribute('href');
        if (href && href !== '#' && !href.startsWith('javascript:')) {
            const targetUrlObj = new URL(href, window.location.origin);
            let targetParams = new URLSearchParams(targetUrlObj.search);
            let pathname = targetUrlObj.pathname;

            if (basePath !== '/' && pathname !== basePath) {
                const searchStr = targetUrlObj.search.replace(/^\?/, '');
                if (!searchStr) {
                    const parts = pathname.split('/').filter(Boolean);
                    const parsedName = visualName || parts.at(-2);
                    const parsedValue = parts.length >= 2 ? parts.at(-1) : "";
                    if (parsedName && parsedValue) {
                        targetParams.set(parsedName, parsedValue);
                    }
                }
                pathname = basePath;
            }

            const controlKeys = new Set();
            document.querySelectorAll('[data-facet-type^="control-"]').forEach(g => getGroupKeys(g).forEach(k => controlKeys.add(k)));
            controlKeys.forEach(k => {
                if (state.has(k)) targetParams.set(k, Array.from(state.get(k)).join(','));
            });

            const queryString = targetParams.toString();
            return `${pathname}${queryString ? '?' + queryString : ''}`;
        }
    }

    let paramsToAdd = new URLSearchParams();
    if (value !== null && value !== undefined && value !== "") {
        const href = trigger?.getAttribute('href');
        if (href && href !== '#' && !href.startsWith('javascript:')) {
            try {
                const u = new URL(href, window.location.origin);
                const searchStr = u.search.replace(/^\?/, '');
                if (searchStr) {
                    paramsToAdd = new URLSearchParams(searchStr);
                } else {
                    const parts = u.pathname.split('/').filter(Boolean);
                    paramsToAdd.append(visualName || parts.at(-2), parts.at(-1) || value);
                }
            } catch (e) { }
        } else {
            paramsToAdd = parseFacetValue(visualName, String(value));
        }
    }

    Array.from(paramsToAdd.keys()).forEach(k => {
        if (!groupKeys.includes(k)) groupKeys.push(k);
    });

    const isEmpty = Array.from(paramsToAdd.keys()).length === 0;

    if (isEmpty) {
        groupKeys.forEach(k => {
            state.delete(k);
            const base = k.replace(/_name$/, '');
            state.delete(base);
            state.delete(`${base}_name`);
        });
    } else {
        if (isMulti) {
            paramsToAdd.forEach((v, k) => {
                const norm = normalizeValue(k, v);
                const current = state.get(k) || new Set();
                if (current.has(norm)) current.delete(norm);
                else current.add(norm);
                if (current.size) state.set(k, current);
                else state.delete(k);
            });
        } else {
            let isCurrentlyActive = true;
            paramsToAdd.forEach((v, k) => {
                const norm = normalizeValue(k, v);
                if (!state.has(k) || !state.get(k).has(norm)) isCurrentlyActive = false;
            });

            if (!isControl && isCurrentlyActive) {
                groupKeys.forEach(k => {
                    state.delete(k);
                    const base = k.replace(/_name$/, '');
                    state.delete(base);
                    state.delete(`${base}_name`);
                });
            } else {
                groupKeys.forEach(k => {
                    state.delete(k);
                    const base = k.replace(/_name$/, '');
                    state.delete(base);
                    state.delete(`${base}_name`);
                });
                paramsToAdd.forEach((v, k) => {
                    state.set(k, new Set([normalizeValue(k, v)]));
                });
            }
        }
    }

    const finalParams = new URLSearchParams();
    state.forEach((vals, key) => {
        if (vals.size > 0) finalParams.set(key, Array.from(vals).join(','));
    });

    params.forEach((v, k) => {
        const isRelated = groupKeys.some(n => {
            const baseN = n.replace(/_name$/, '');
            return k === n || k === baseN || k === `${baseN}_name`;
        });
        if (!state.has(k) && k !== 'paged' && k !== 'page' && !isRelated) {
            finalParams.set(k, v);
        }
    });

    const queryString = finalParams.toString();
    return `${basePath}${queryString ? '?' + queryString : ''}`;
};

const setCookie = (name, value, days = 30) => {
    let expires = "";
    if (!value) days = -1;
    if (days) {
        let date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
};

const getCookie = (name) => {
    let nameEQ = name + "=";
    let ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
};

const updateCookiesFromState = () => {
    const { state } = getUnifiedState();
    document.querySelectorAll('[data-facet-cookie], [data-facet-cokkie]').forEach(group => {
        const groupKeys = getGroupKeys(group);
        const fallbackName = group.getAttribute('data-facet-name') || groupKeys[0];
        const cookieKey = group.getAttribute('data-facet-cookie') || group.getAttribute('data-facet-cokkie');
        const visualKey = cookieKey && cookieKey !== 'true' && cookieKey !== '' ? cookieKey : fallbackName;

        if (!visualKey) return;

        const cookieName = `facet_${visualKey}`;
        let activeParams = new URLSearchParams();
        let hasActive = false;

        groupKeys.forEach(k => {
            if (state.has(k)) {
                activeParams.set(k, Array.from(state.get(k)).join(','));
                hasActive = true;
            }
        });

        if (hasActive) {
            setCookie(cookieName, activeParams.toString());
        } else {
            setCookie(cookieName, '');
        }
    });
};

const applyFilter = async (name, value, facetType, trigger, facetName = null, isControl = false) => {
    const facetRoot = getFacetRoot(trigger);
    if (!facetRoot || facetRoot.getAttribute('data-facet-mode') === 'submit') return;
    const newUrl = buildFilterUrl(name, value, facetType, trigger, facetName, isControl);
    window.history.pushState({ url: newUrl }, '', newUrl);
    updateCookiesFromState();
    syncChips();
    await updateContent(newUrl, trigger);
};

document.addEventListener('change', async (e) => {
    const el = e.target;
    const group = el.closest('[data-facet-type^="filter-"], [data-facet-type^="control-"]');
    if (!group) return;
    const facetType = group.getAttribute('data-facet-type');
    const facetName = group.getAttribute('data-facet-name');
    const name = el.name || el.getAttribute('name');
    const isControl = el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !['checkbox', 'radio'].includes(el.type));
    const isMulti = facetType === 'filter-multiple' || facetType === 'filter-multiiple' || facetType === 'control-multiple';

    if (isMulti && el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
        const value = el.value || el.getAttribute('value');
        const isAll = value === "" || value === null;
        if (isAll && el.checked) {
            group.querySelectorAll('input:checked').forEach(i => { if (i !== el) i.checked = false; });
        } else if (!isAll) {
            group.querySelectorAll('input[value=""], [name][value=""]').forEach(i => { if (i.tagName === 'INPUT') i.checked = false; });
            if (group.querySelectorAll('input:checked').length === 0) {
                group.querySelectorAll('input[value=""], [name][value=""]').forEach(i => { if (i.tagName === 'INPUT') i.checked = true; });
            }
        }
    }

    if (el.tagName === 'SELECT' && el.multiple) {
        const multiValue = Array.from(el.selectedOptions).map(o => o.value).join(',');
        await applyFilter(name || group.getAttribute('data-facet-name'), multiValue, 'filter-multiple', el, facetName, true);
    } else {
        await applyFilter(name || group.getAttribute('data-facet-name'), el.value, facetType, el, facetName, isControl);
    }
});

document.addEventListener('click', async (e) => {
    const el = e.target;
    const resetBtn = el.closest('[data-facet-type="reset"]');
    if (resetBtn) {
        e.preventDefault();
        const currentUrl = new URL(window.location.href);
        const params = new URLSearchParams(currentUrl.search);
        const facetRoot = getFacetRoot(resetBtn) || document;
        const filterGroups = Array.from(facetRoot.querySelectorAll('[data-facet-type^="filter-"]'));

        const protectedGroups = Array.from(document.querySelectorAll('[data-facet-type="single"], [data-facet-type^="control-"]'));
        const protectedKeys = new Set();
        protectedGroups.forEach(group => {
            const keys = getGroupKeys(group);
            keys.forEach(k => {
                protectedKeys.add(k);
                protectedKeys.add(`${k}_name`);
                protectedKeys.add(k.replace(/_name$/, ''));
            });
        });

        const filterNamesToReset = new Set();
        filterGroups.forEach(group => {
            const keys = getGroupKeys(group);
            keys.forEach(k => {
                const base = k.replace(/_name$/, '');
                if (!protectedKeys.has(k) && !protectedKeys.has(base) && !protectedKeys.has(`${base}_name`)) {
                    filterNamesToReset.add(k);
                }
            });
        });

        let hasActiveFilter = false;
        filterNamesToReset.forEach(name => {
            const base = name.replace(/_name$/, '');
            if (params.has(name) || params.has(`${base}_name`) || params.has(base)) hasActiveFilter = true;
        });
        if (!hasActiveFilter) return;

        filterNamesToReset.forEach(name => {
            const base = name.replace(/_name$/, '');
            params.delete(name);
            params.delete(`${base}_name`);
            params.delete(base);
        });
        params.delete('paged');
        params.delete('page');

        let path = currentUrl.pathname.replace(/\/page\/\d+\/?/i, '/');
        if (!path.endsWith('/')) path += '/';
        const finalUrl = `${path}${params.toString() ? '?' + params.toString() : ''}`;
        window.history.pushState({ url: finalUrl }, '', finalUrl);
        updateCookiesFromState();
        syncChips();
        await updateContent(finalUrl, resetBtn);
        return;
    }

    const actionEl = el.closest('a, button, [name][value]');
    if (!actionEl || ['INPUT', 'SELECT', 'OPTION'].includes(actionEl.tagName)) return;

    const facetRoot = getFacetRoot(actionEl);
    if (!facetRoot) return;

    const group = actionEl.closest('[data-facet-type]');
    const facetType = group?.getAttribute('data-facet-type');
    if (!facetType || facetType === 'search' || facetType === 'submit') return;

    if (facetType.startsWith('filter-') || facetType.startsWith('control-')) {
        e.preventDefault();
        const facetName = group.getAttribute('data-facet-name');
        let name = actionEl.name || actionEl.getAttribute('name');
        let value = actionEl.value || actionEl.getAttribute('value');

        const href = actionEl.getAttribute('href');
        if (href && href !== '#' && !href.startsWith('javascript:')) {
            try {
                const u = new URL(href, window.location.origin);
                const searchStr = u.search.replace(/^\?/, '');
                if (searchStr) {
                    value = searchStr;
                } else {
                    const parts = u.pathname.split('/').filter(Boolean);
                    name = name || parts.at(-2);
                    value = parts.length >= 2 ? parts.at(-1) : "";
                }
            } catch (e) { }
        }

        const isMulti = facetType === 'filter-multiple' || facetType === 'filter-multiiple' || facetType === 'control-multiple';
        const isAllButton = value === "" || value === null || value === undefined;
        const isActive = actionEl.classList.contains('is-active');

        if (isMulti) {
            if (isAllButton) {
                group.querySelectorAll('.is-active, input:checked').forEach(item => {
                    item.classList.remove('is-active');
                    if (item.tagName === 'INPUT') item.checked = false;
                });
                actionEl.classList.add('is-active');
            } else {
                actionEl.classList.toggle('is-active');
                group.querySelectorAll('button[value=""], [name][value=""], a[value=""], input[value=""]').forEach(all => {
                    all.classList.remove('is-active');
                    if (all.tagName === 'INPUT') all.checked = false;
                });
                if (group.querySelectorAll('.is-active, input:checked').length === 0) {
                    group.querySelectorAll('button[value=""], [name][value=""], a[value=""], input[value=""]').forEach(all => {
                        all.classList.add('is-active');
                        if (all.tagName === 'INPUT') all.checked = true;
                    });
                    value = "";
                }
            }
        } else {
            if (isActive) {
                if (!facetType.startsWith('control-')) {
                    actionEl.classList.remove('is-active');
                    group.querySelectorAll('button[value=""], [name][value=""], a[value=""]').forEach(all => {
                        if (all.getAttribute('href') !== href) {
                            all.classList.add('is-active');
                        }
                    });
                    value = "";
                }
            } else {
                group.querySelectorAll('.is-active').forEach(item => item.classList.remove('is-active'));
                actionEl.classList.add('is-active');
            }
        }

        const isControlFacet = facetType.startsWith('control-');
        await applyFilter(name || group.getAttribute('data-facet-name'), value || "", facetType, actionEl, facetName, isControlFacet);
        return;
    }

    const href = actionEl.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    const cleanHref = cleanPaginationFromUrl(href);
    if (facetType === 'single') {
        actionEl.closest('[data-facet-type]')?.querySelectorAll('.is-active').forEach(el => el.classList.remove('is-active'));
        actionEl.classList.add('is-active');

        const groupKeys = getGroupKeys(group);
        const facetName = group?.getAttribute('data-facet-name');
        if (facetName && !groupKeys.includes(facetName)) groupKeys.push(facetName);

        const targetUrlObj = new URL(cleanHref, window.location.origin);
        let targetParams = new URLSearchParams(targetUrlObj.search);
        let pathname = targetUrlObj.pathname;

        const { basePath } = getUnifiedState();

        if (basePath !== '/' && pathname !== basePath) {
            const searchStr = targetUrlObj.search.replace(/^\?/, '');
            if (!searchStr) {
                const parts = pathname.split('/').filter(Boolean);
                const parsedName = facetName || parts.at(-2);
                const parsedValue = parts.length >= 2 ? parts.at(-1) : "";
                if (parsedName && parsedValue) {
                    targetParams.set(parsedName, parsedValue);
                }
            }
            pathname = basePath;
        }

        const controlKeys = new Set();
        document.querySelectorAll('[data-facet-type^="control-"]').forEach(g => getGroupKeys(g).forEach(k => controlKeys.add(k)));
        const { state } = getUnifiedState();
        controlKeys.forEach(k => {
            if (state.has(k)) targetParams.set(k, Array.from(state.get(k)).join(','));
        });

        const queryString = targetParams.toString();
        const finalUrl = `${pathname}${queryString ? '?' + queryString : ''}`;

        window.history.pushState({ url: finalUrl }, '', finalUrl);
        syncChips();
        await updateContent(finalUrl, actionEl);
        return;
    }

    if (facetType !== 'more' && !isMoreScrollType(facetType)) window.history.pushState({ url: cleanHref }, '', cleanHref);
    await updateContent(cleanHref, actionEl);
});

document.addEventListener('submit', async (e) => {
    const form = e.target.closest('form[data-facet-type="search"]');
    if (!form) return;
    e.preventDefault();
    const params = new URLSearchParams(new FormData(form));
    for (const [key, value] of [...params]) if (!value?.trim()) params.delete(key);
    const url = `${form.action}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.pushState({ url }, '', url);
    await updateContent(url, form);
});

window.addEventListener('popstate', async () => {
    const url = window.location.href;
    cache.delete(url);
    await updateContent(url, 'popstate');
});

document.addEventListener('DOMContentLoaded', () => {
    let urlChanged = false;
    const currentUrl = new URL(window.location.href);
    const searchParams = currentUrl.searchParams;
    const { state } = getUnifiedState();

    document.querySelectorAll('[data-facet-cookie], [data-facet-cokkie]').forEach(group => {
        const groupKeys = getGroupKeys(group);
        const fallbackName = group.getAttribute('data-facet-name') || groupKeys[0];
        const cookieKey = group.getAttribute('data-facet-cookie') || group.getAttribute('data-facet-cokkie');
        const visualKey = cookieKey && cookieKey !== 'true' && cookieKey !== '' ? cookieKey : fallbackName;

        if (!visualKey) return;

        const cookieName = `facet_${visualKey}`;
        const savedValue = getCookie(cookieName);

        if (savedValue) {
            let isGroupActiveInUrl = false;
            groupKeys.forEach(k => {
                if (state.has(k)) isGroupActiveInUrl = true;
            });

            if (!isGroupActiveInUrl) {
                if (!savedValue.includes('=')) {
                    if (searchParams.get(visualKey) !== savedValue) {
                        searchParams.set(visualKey, savedValue);
                        urlChanged = true;
                    }
                } else {
                    const parsed = new URLSearchParams(savedValue);
                    let actuallyAdded = false;
                    parsed.forEach((val, key) => {
                        if (searchParams.get(key) !== val) {
                            searchParams.set(key, val);
                            actuallyAdded = true;
                        }
                    });
                    if (actuallyAdded) urlChanged = true;
                }
            }
        }
    });

    if (urlChanged) {
        currentUrl.search = searchParams.toString();
        window.location.replace(currentUrl.toString());
        return;
    }

    window.history.replaceState({ url: window.location.href }, '', window.location.href);
    syncInputs();

    document.querySelectorAll('[data-facet-animation]').forEach(container => {
        applyStagger(container, false, true);
    });
    initInfiniteScroll();
    syncMoreVisibility();
    observeCollections();
});
