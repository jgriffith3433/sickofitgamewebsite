# Blog System Documentation

This document explains how to add and manage blog posts for the Sick Of It website.

## 📁 Blog Structure

```
blog/
├── index.html              # Blog home page
├── development.html        # Development category page
├── lore.html              # Lore category page
├── updates.html           # Updates category page
├── announcements.html     # Announcements category page
└── posts/
    └── welcome.html       # Example blog post
```

## ➕ Adding a New Blog Post

### Step 1: Create the Post File

1. Create a new HTML file in the `blog/posts/` directory
2. Use a descriptive filename (e.g., `my-first-devlog.html`)
3. Copy the structure from `blog/posts/welcome.html` as a template

### Step 2: Customize the Post Content

Edit the following sections in your new post:

```html
<!-- Update the title tag -->
<title>Your Post Title - Sick Of It Blog</title>

<!-- Update the post header -->
<h1 class="post-title">Your Post Title</h1>

<!-- Update the date -->
<span>📅 Your Date</span>

<!-- Update the category tag -->
<span class="category-tag">Your Category</span>

<!-- Add your post content -->
<div class="post-content">
  <!-- Your content here -->
</div>
```

### Step 3: Add the Post to Category Pages

Add a post card to the relevant category page(s):

**Example for announcements.html:**

```html
<div class="posts-grid" id="postsContainer">
  <a href="posts/your-post.html" class="post-card">
    <div class="post-meta">
      <span>📅 Your Date</span>
    </div>
    <h3>Your Post Title</h3>
    <p>Brief summary of your post (1-2 sentences)</p>
  </a>
  <!-- Other posts... -->
</div>
```

### Step 4: Update the Blog Home Page (Optional)

If this is the latest post, update the "Latest Update" section in `blog/index.html`:

```html
<section class="latest-post">
  <h2>📌 Latest Update</h2>
  <div class="post-preview">
    <h3>Your Post Title</h3>
    <div class="post-meta">
      <span>📅 Your Date</span>
      <span class="category-tag">Your Category</span>
    </div>
    <p>Your post summary...</p>
    <a href="posts/your-post.html" class="read-more">Read Full Post →</a>
  </div>
</section>
```

## 📝 Post Categories

When creating a post, use one of these four categories:

- **Development** (💻): Devlogs, feature progress, technical updates
- **Lore** (📖): Worldbuilding, characters, story, factions
- **Updates** (🔄): Patch notes, releases, major changes
- **Announcements** (📢): Important news and milestones

## 🎨 Styling Elements

### Headers

```html
<h2>Main Section Header</h2>
<h3>Subsection Header</h3>
```

### Emphasis

```html
<strong>Bold text</strong>
<em>Italicized text (appears in blue)</em>
```

### Highlight Box

```html
<div class="highlight-box">
  <h3>Box Title</h3>
  <p>Important highlighted content</p>
</div>
```

### Code

```html
<code>inline code</code>
```

### Blockquote

```html
<blockquote>
  A quoted section or callout
</blockquote>
```

### Lists

```html
<ul>
  <li>Bullet point</li>
  <li>Another point</li>
</ul>

<ol>
  <li>Numbered item</li>
  <li>Another item</li>
</ol>
```

## 📱 Mobile Responsiveness

All blog pages are fully mobile responsive. The system includes:

- **Responsive navigation**: Automatically collapses into a hamburger menu on mobile
- **Flexible layouts**: Grid systems adjust to single-column on small screens
- **Touch-friendly**: Buttons and links sized appropriately for touch
- **Readable text**: Font sizes adjust for different screen sizes

No additional work needed for mobile support!

## 🔗 Navigation

### Internal Links

Link to other blog pages or posts:

```html
<a href="../index.html">Blog Home</a>
<a href="../development.html">Development</a>
<a href="posts/other-post.html">Another Post</a>
```

### Back to Game

Link back to the main game page:

```html
<a href="../../index.html">Play</a>
```

## ✅ Checklist for New Posts

- [ ] Create HTML file in `blog/posts/`
- [ ] Update title and meta tags
- [ ] Set correct date and category
- [ ] Write post content
- [ ] Add post to relevant category page(s)
- [ ] Update blog home page if it's the latest post
- [ ] Test on desktop and mobile
- [ ] Verify all links work

## 💡 Tips

1. **Keep URLs descriptive**: Use clear filenames like `new-level-preview.html`
2. **Write engaging summaries**: The preview text should entice readers
3. **Use images sparingly**: Keep file sizes small for fast loading
4. **Update regularly**: Consistent posting keeps visitors engaged
5. **Cross-link**: Reference related posts to keep readers exploring

## 🚀 Quick Start Example

Want to add a development update? Here's the fastest way:

1. Copy `blog/posts/welcome.html` to `blog/posts/dev-update-march.html`
2. Change the title to "Development Update - March 2026"
3. Update the category tag to "Development"
4. Replace the content with your update
5. Add a post card to `blog/development.html`
6. Update the latest post section in `blog/index.html`
7. Done!

---

**Need help?** All blog pages follow the same structure and styling system, making it easy to maintain consistency across your content.
