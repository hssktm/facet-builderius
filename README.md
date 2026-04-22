# Builderius Facets

A lightweight JavaScript library for dynamic filtering, pagination, search, and infinite scroll — built for [Builderius](https://builderius.io) but usable with any WordPress setup.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Attributes Reference](#attributes-reference)
- [Facet Types](#facet-types)
- [Interactive Rendering (has="collection")](#interactive-rendering-hascollection)
- [HTML Examples](#html-examples)
- [Linking Facets to Content](#linking-facets-to-content)
- [Advanced Features](#advanced-features)

---

## How It Works

Every facet needs two things:

1. A **facet group** — an element with `data-facet` and `data-facet-type` that holds your filter controls
2. A **content container** — the element where results are rendered, pointed to by the `data-facet` selector

When a user interacts with a facet (clicking a link, checking a checkbox, typing in a search field), the library builds a new URL, fetches the page at that URL, extracts the updated content, and swaps it in — no full page reload.

```text
[data-facet="my-results"] ──points to──► [data-filter=""] or .my-results or #my-results
```

---

## Attributes Reference

### `data-facet="selector"`

Placed on any facet group element. The value is a CSS selector pointing to the content container that should update when this facet changes.

| Value format | Example | Matches |
|---|---|---|
| Attribute name | `data-facet="data-filter"` | `[data-filter]` |
| Class | `data-facet=".results"` | `.results` |
| ID | `data-facet="#results"` | `#results` |

---

### `data-facet-type="value"`

Defines the behavior of a facet group.

| Type | Description |
|---|---|
| `filter-single` | Single value filter — selecting a new value deselects the previous one |
| `filter-multiple` | Multi-value filter — values toggle on/off and stack with commas |
| `control-single` | Acts like `filter-single` but protects its value from being cleared by the `reset` button. Used for layout switchers (e.g., list/grid view). |
| `control-multiple` | Acts like `filter-multiple` but is **not** cleared by the `reset` button. |
| `single` | Navigation by URL path (e.g. categories). Not treated as a filter — never reset by the reset button |
| `search` | Search form |
| `pagination` | Page navigation links |
| `more` | Load more button — appends results on click |
| `more-scroll` | Auto load more on scroll — unlimited |
| `more-scroll:N` | Auto load more on scroll up to N times, then becomes a regular button |
| `reset` | Resets all filters in the same `data-facet` group |
| `submit` | Collects all filter values and applies them at once instead of on each change |

---

### `data-facet-chips`

Placed on an empty container where you want to display the currently active filters as removable "chips" or tags. The library automatically populates this container with buttons representing active selections. Clicking one of these buttons automatically removes the corresponding filter.

```html
<!-- The library will inject <button data-facet-name="..." value="...">Label</button> here -->
<div data-facet-chips></div>
```

If used alongside Interactive Rendering (`has="collection"`), the library updates the container's `data-b-context` with a JSON array of active filters instead of HTML, letting Builderius natively render the chips.

---

### `data-facet-cookie`

Placed on any facet group to automatically persist the user's selection across page reloads using browser cookies. When the user returns or refreshes the page, the library will seamlessly inject the saved state back into the URL and fetch the correct content.

You can explicitly provide a customized cookie suffix via the attribute value, or leave it empty/true to allow auto-detection based on `data-facet-name` or the filter's internal keys.

```html
<!-- Explicit cookie name ("facet_layout") -->
<div data-facet=".results" data-facet-type="control-single" data-facet-cookie="layout">
  <button type="button" name="grid" value="list">List View</button>
  <button type="button" name="grid" value="grid">Grid View</button>
</div>

<!-- Auto-named cookie (inherits "color" from data-facet-name, creates "facet_color") -->
<div data-facet=".results" data-facet-type="filter-multiple" data-facet-name="color" data-facet-cookie>
  <input type="checkbox" name="color" value="blue"> Blue
  <input type="checkbox" name="color" value="red"> Red
</div>
```

---

### `data-facet-dynamic="false"`

Placed on a `data-facet` container. When set to `false`, the library will not update any HTML inside this group — neither `innerHTML` nor `data-b-context`. Useful when your filter UI is static and only the results container should update.

```html
<div data-facet=".results" data-facet-dynamic="false">
  <!-- These filters will not be re-rendered after each request -->
</div>
```

---

### `data-facet-top="N"`

Placed on any facet element or the content container. After a filter or pagination action, the page scrolls so the element's top edge is `N` pixels from the top of the viewport.

```html
<!-- Scroll to container top (80px offset) on any filter action -->
<div data-facet=".results" data-facet-top="80">

<!-- Scroll only when pagination is clicked -->
<div data-facet=".results" data-facet-type="pagination" data-facet-top="80">
```

`more` and `more-scroll` types are excluded from this behavior — they never trigger a scroll.

---

### `data-facet-mode="submit"`

Placed on a `data-facet` container. When set to `submit`, filter clicks only toggle the `is-active` class visually — no request is made until the user clicks the `submit` button.

```html
<div data-facet=".results" data-facet-mode="submit">
  <div data-facet-type="filter-multiple">
    <a href="?color=blue">Blue</a>
    <a href="?color=red">Red</a>
  </div>
  <button data-facet-type="submit">Apply filters</button>
</div>
```

---

### `data-facet-animation`

Placed on child elements inside the content container. The library sets a `--animation-child-facet` CSS custom property (0, 1, 2...) on each new item, which you can use to stagger entrance animations.

```css
[data-facet-animation] {
  animation: fadeIn 0.3s ease both;
  animation-delay: calc(var(--animation-child-facet) * 60ms);
}
```

---

## Facet Types

### filter-single

Selects one value at a time. Selecting the same value again deactivates it.

Works with: `<a>`, `<button>`, `<input type="radio">`, `<select>` (non-multiple)

**Via query param:**
```html
<div data-facet=".results" data-facet-type="filter-single">
  <a href="?color=blue">Blue</a>
  <a href="?color=red">Red</a>
</div>
```

**Via path:**
```html
<div data-facet=".results" data-facet-type="filter-single">
  <a href="/category/blue/">Blue</a>
  <a href="/category/red/">Red</a>
</div>
```

**Via radio inputs:**
```html
<div data-facet=".results" data-facet-type="filter-single">
  <input type="radio" name="color" value="blue">
  <input type="radio" name="color" value="red">
</div>
```

**Via select:**
```html
<select data-facet-type="filter-single" name="color">
  <option value="blue">Blue</option>
  <option value="red">Red</option>
</select>
```

**Via button with name/value:**
```html
<div data-facet=".results" data-facet-type="filter-single">
  <button type="button" name="color" value="blue">Blue</button>
  <button type="button" name="color" value="red">Red</button>
</div>
```

---

### filter-multiple

Toggles values on/off. Multiple values stack as comma-separated params: `?color=blue,red`.

Works with: `<a>`, `<button>`, `<input type="checkbox">`, `<select multiple>`

**Via links:**
```html
<div data-facet=".results" data-facet-type="filter-multiple">
  <a href="?color=blue">Blue</a>
  <a href="?color=red">Red</a>
  <a href="?color=pink">Pink</a>
</div>
```

**Via checkboxes:**
```html
<div data-facet=".results" data-facet-type="filter-multiple">
  <input type="checkbox" name="color" value="blue">
  <input type="checkbox" name="color" value="red">
  <input type="checkbox" name="color" value="pink">
</div>
```

**Via multi-select:**
```html
<select data-facet-type="filter-multiple" name="color" multiple>
  <option value="blue">Blue</option>
  <option value="red">Red</option>
</select>
```

**Via buttons with href:**
```html
<div data-facet=".results" data-facet-type="filter-multiple">
  <button href="?color=blue">Blue</button>
  <button href="?color=red">Red</button>
</div>
```

---

### single

Navigation by path. Used for category pages or any URL-based navigation. These links update content but are **never reset** by the reset button and are treated as navigation, not filters.

```html
<div data-facet=".results" data-facet-type="single">
  <a href="/category/blue/">Blue</a>
  <a href="/category/red/">Red</a>
</div>
```

The active link gets the `is-active` class based on the current URL path.

---

### search

A standard search form. On submit, parameters are extracted and the content updates.

```html
<form
  action="/"
  data-facet=".results"
  data-facet-type="search"
  role="search"
>
  <input type="search" name="s" placeholder="Search...">
  <button type="submit">Search</button>
</form>
```

---

### pagination

Standard WordPress-style pagination. The library handles both `?paged=N` and `/page/N/` URL formats, always normalizing to the clean `/page/N/` path format.

```html
<div data-facet=".results" data-facet-type="pagination" data-facet-top="80">
  <a href="/page/1/">1</a>
  <span class="current">2</span>
  <a href="/page/3/">3</a>
  <a href="/page/3/">Next »</a>
</div>
```

Applying any filter automatically resets pagination back to page 1.

---

### more

A button to append the next page of results to the existing ones.

```html
<div data-facet=".results" data-facet-type="more">
  <a href="/page/2/">Load more</a>
</div>
```

When the linked page has no further results, the element is automatically hidden (`display: none`).

---

### more-scroll

Auto-loads the next page when the element scrolls into the viewport.

```html
<div data-facet=".results" data-facet-type="more-scroll">
  <a href="/page/2/">Load more</a>
</div>
```

---

### more-scroll:N

Auto-loads up to N times, then stops observing and behaves as a regular `more` button.

```html
<!-- Loads automatically on scroll 3 times, then requires a click -->
<div data-facet=".results" data-facet-type="more-scroll:3">
  <a href="/page/2/">Load more</a>
</div>
```

---

### reset

Resets all filter values within the same `data-facet` group. `single` type facets are never affected.

```html
<button type="reset" data-facet-type="reset" data-facet=".results">
  Clear filters
</button>

<!-- Or inside a data-facet container -->
<div data-facet=".results" data-facet-mode="submit">
  <!-- ...filters... -->
  <button data-facet-type="reset">Clear</button>
  <button data-facet-type="submit">Apply</button>
</div>
```

---

### submit

Collects all current filter values and applies them in a single request. Useful when you want the user to configure all filters before fetching.

```html
<div data-facet=".results" data-facet-mode="submit">
  <div data-facet-type="filter-multiple">
    <input type="checkbox" name="color" value="blue">
    <input type="checkbox" name="color" value="red">
  </div>
  <button data-facet-type="submit">Apply</button>
  <button data-facet-type="reset">Clear</button>
</div>
```

---

### Range inputs

Range and number inputs work with any `filter-single` group. They update on `change`.

```html
<div data-facet=".results" data-facet-type="filter-single">
  <input type="range" name="price" min="0" max="1000" step="10">
</div>

<!-- Min / Max pair -->
<div data-facet=".results" data-facet-type="filter-single">
  <input type="number" name="min_price" min="0" max="1000">
  <input type="number" name="max_price" min="0" max="1000">
</div>
```

---

## Interactive Rendering (has="collection")

Builderius has an **Interactive Rendering** mode. When enabled on a node, Builderius adds two attributes to the element:

- `has="collection"` — marks the element as data-driven
- `data-b-context="[...]"` — a JSON array of data used to render the children

When the library detects `has="collection"` on the content container or a facet group, it **only updates `data-b-context`** instead of replacing `innerHTML`. Builderius then re-renders the children automatically from the new JSON — this is ~20% faster than full HTML replacement because Builderius diffs the data instead of re-parsing HTML.

**When to use it:**

- Enable Interactive Rendering on your results container for faster updates
- Enable it on facet groups (like a filter list with counts) so their counts update dynamically
- If your facets are static (`data-facet-dynamic="false"`), Interactive Rendering on the facets is not needed — only on the results

**Example — results container with Interactive Rendering:**
```html
<div
  data-filter=""
  has="collection"
  data-b-context="[{...}, {...}]"
>
  <!-- Builderius renders cards here from data-b-context -->
</div>
```

**Example — facet with Interactive Rendering (counts update after filter):**
```html
<div
  data-facet=".results"
  data-facet-type="filter-single"
  has="collection"
  data-b-context='[
    {"name":"blue","url":"?color=blue","count":4},
    {"name":"red","url":"?color=red","count":2}
  ]'
>
  <a href="?color=blue">Blue 4</a>
  <a href="?color=red">Red 2</a>
</div>
```

---

## HTML Examples

### Full filter sidebar + results

```html
<!-- Filter sidebar -->
<div data-facet=".results" data-facet-dynamic="false">

  <!-- Search -->
  <form action="/" data-facet-type="search" role="search" data-facet=".results">
    <input type="search" name="s" placeholder="Search...">
    <button type="submit">Search</button>
  </form>

  <!-- Category navigation (never reset) -->
  <div data-facet-type="single" data-facet=".results">
    <a href="/category/blue/">Blue</a>
    <a href="/category/red/">Red</a>
  </div>

  <!-- Single-value filter via links -->
  <div data-facet-type="filter-single" data-facet=".results">
    <a href="?color=blue">Blue</a>
    <a href="?color=red">Red</a>
  </div>

  <!-- Multi-value filter via checkboxes -->
  <div data-facet-type="filter-multiple" data-facet=".results">
    <input type="checkbox" name="tag" value="sale">
    <input type="checkbox" name="tag" value="new">
  </div>

  <!-- Select dropdown -->
  <select data-facet-type="filter-single" name="sort" data-facet=".results">
    <option value="">Default</option>
    <option value="asc">Price: Low to High</option>
    <option value="desc">Price: High to Low</option>
  </select>

  <!-- Range -->
  <div data-facet-type="filter-single" data-facet=".results">
    <input type="range" name="max_price" min="0" max="500" step="10">
  </div>

  <!-- Reset -->
  <button type="reset" data-facet-type="reset" data-facet=".results">
    Clear all
  </button>

</div>

<!-- Results -->
<div class="results" data-facet-top="80">
  <!-- cards rendered here -->
</div>

<!-- Pagination -->
<div data-facet=".results" data-facet-type="pagination" data-facet-top="80">
  <a href="/page/2/">Next</a>
</div>

<!-- Load more (auto, 3 times then button) -->
<div data-facet=".results" data-facet-type="more-scroll:3">
  <a href="/page/2/">Load more</a>
</div>
```

---

## Linking Facets to Content

Multiple facets can point to the same content container — they just need to share the same `data-facet` selector value.

```html
<div data-facet=".results" data-facet-type="filter-single">...</div>
<div data-facet=".results" data-facet-type="filter-multiple">...</div>
<div data-facet=".results" data-facet-type="pagination">...</div>

<div class="results">...</div>
```

The selector supports:

```html
data-facet="data-results"   → matches [data-results]
data-facet=".results"       → matches .results
data-facet="#results"       → matches #results
```

---

## Advanced Features

### `is-active` class

The library automatically adds `is-active` to any link, button, checkbox, radio, or select option that matches the current URL state — both for query params and path-based URLs.

```css
a.is-active { font-weight: bold; }
input:checked { /* handled natively */ }
```

### Browser history

Every filter, pagination, and search action pushes a new entry to `window.history` so the back/forward buttons work correctly. `more` and `more-scroll` do not push history entries.

### Caching

Fetched pages are cached in memory (up to 50 entries, LRU). Navigating back to a previously visited filter state is instant. Cache is skipped for `search`, `filter-single`, `filter-multiple`, and `more-scroll` to always show fresh counts.

### `data-facet-mode="submit"` with links

When a facet container has `data-facet-mode="submit"`, clicking filter links only toggles their `is-active` class. No request is made until the user clicks the `submit` button, which collects all currently active values and applies them.

---

## Grouping Facets Under a Single Container

Instead of repeating `data-facet=".results"` on every facet group, you can wrap them all in a single parent element that carries the `data-facet` selector. Each child only needs `data-facet-type`.

```html
<!-- Without grouping — selector repeated on every facet -->
<div data-facet=".results" data-facet-type="filter-single">...</div>
<div data-facet=".results" data-facet-type="filter-multiple">...</div>
<div data-facet=".results" data-facet-type="reset">...</div>
<div data-facet=".results" data-facet-type="pagination">...</div>

<!-- With grouping — selector declared once on the parent -->
<div data-facet=".results">
  <div data-facet-type="filter-single">...</div>
  <div data-facet-type="filter-multiple">...</div>
  <button data-facet-type="reset">Clear</button>
</div>

<!-- Pagination can still be outside the group with its own data-facet -->
<div data-facet=".results" data-facet-type="pagination" data-facet-top="80">
  <a href="/page/2/">Next</a>
</div>
```

This works with any element — a `<div>`, a `<form>`, an `<aside>`, whatever fits your layout. The library walks up the DOM from any trigger to find the nearest `[data-facet]` ancestor.

---

## WordPress Integration

> **Important:** This library only handles the front-end — it transforms URLs and swaps content without a full page reload. It does **not** make WordPress understand your filter parameters.

For WordPress to actually filter posts based on your URL params (like `?color=blue&tag=sale`), you need to hook into the query on the server side. Without this, WordPress will ignore your parameters and return unfiltered results.

### How it works

When a user clicks a filter, the library fetches a URL like:

```
/category/blue/?tag=sale&max_price=200
```

WordPress needs to intercept those query vars and modify `WP_Query` accordingly.

### Example: registering custom query vars

```php
// Register your custom params so WordPress doesn't strip them
add_filter( 'query_vars', function( $vars ) {
    $vars[] = 'color';
    $vars[] = 'tag';
    $vars[] = 'min_price';
    $vars[] = 'max_price';
    $vars[] = 'max_title_words';
    return $vars;
});
```

### Example: modifying the query based on params

```php
add_action( 'pre_get_posts', function( $query ) {
    if ( is_admin() || ! $query->is_main_query() ) return;

    // Filter by custom taxonomy
    $color = get_query_var( 'color' );
    if ( $color ) {
        $query->set( 'tax_query', [[
            'taxonomy' => 'color',
            'field'    => 'slug',
            'terms'    => explode( ',', $color ),
        ]]);
    }

    // Filter by post tag
    $tag = get_query_var( 'tag' );
    if ( $tag ) {
        $query->set( 'tag_slug__in', explode( ',', $tag ) );
    }

    // Filter by max price (custom field)
    $max_price = get_query_var( 'max_price' );
    if ( $max_price ) {
        $query->set( 'meta_query', [[
            'key'     => '_price',
            'value'   => $max_price,
            'compare' => '<=',
            'type'    => 'NUMERIC',
        ]]);
    }
});
```

### Example: filtering by word count in title

```php
add_filter( 'posts_where', function( $where, $query ) {
    $max = get_query_var( 'max_title_words' );
    if ( $max ) {
        global $wpdb;
        $where .= $wpdb->prepare(
            " AND (LENGTH(%i.post_title) - LENGTH(REPLACE(%i.post_title, ' ', '')) + 1) <= %d",
            $wpdb->posts, $wpdb->posts, intval( $max )
        );
    }
    return $where;
}, 10, 2 );
```

### Example: filtering posts by a URL path segment (slug-based)

When using path-based filters like `/category/blue/`, WordPress handles this natively through its rewrite rules. For custom taxonomies you may need to register them with `rewrite` enabled:

```php
register_taxonomy( 'color', 'post', [
    'rewrite' => [ 'slug' => 'color' ],
    // ...
]);
```

---

## Coming Soon

Setting up WordPress query filters by hand for every param can get repetitive. A **dedicated plugin** is in the works that will make this setup much easier — registering query vars, mapping params to taxonomies, meta fields, and custom query logic with minimal configuration.

In the meantime, the examples above cover the most common cases and can be placed in your theme's `functions.php` or a custom plugin file.

---
