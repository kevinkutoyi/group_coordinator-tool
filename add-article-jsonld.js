const fs = require('fs');
const file = 'frontend/src/pages/BlogPostPage.js';
let src = fs.readFileSync(file, 'utf8');

const anchor = `    if (post.noIndex) setMeta("robots", "noindex, follow");
    else setMeta("robots", "index, follow");
  }, [post]);`;

const replacement = `    if (post.noIndex) setMeta("robots", "noindex, follow");
    else setMeta("robots", "index, follow");

    let ld = document.getElementById("ld-article");
    if (!ld) {
      ld = document.createElement("script");
      ld.type = "application/ld+json";
      ld.id = "ld-article";
      document.head.appendChild(ld);
    }
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description: post.metaDescription || post.excerpt || "",
      image: post.ogImage || post.coverImage ? [post.ogImage || post.coverImage] : undefined,
      author: { "@type": "Person", name: post.authorName },
      publisher: {
        "@type": "Organization",
        name: "SplitSubs",
        logo: { "@type": "ImageObject", url: "https://splitsubs.com/og-image.png" },
      },
      datePublished: post.publishedAt || post.createdAt,
      dateModified: post.updatedAt || post.publishedAt || post.createdAt,
      mainEntityOfPage: { "@type": "WebPage", "@id": \`https://splitsubs.com/blog/\${post.slug}\` },
    });

    return () => { const el = document.getElementById("ld-article"); if (el) el.remove(); };
  }, [post]);`;

if (src.includes(anchor)) {
  src = src.replace(anchor, replacement);
  fs.writeFileSync(file, src);
  console.log('✓ Article JSON-LD added to BlogPostPage');
} else {
  console.log('⚠ Anchor not found — no changes made');
}
