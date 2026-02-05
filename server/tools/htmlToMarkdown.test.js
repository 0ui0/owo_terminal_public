
import htmlToMarkdown from './htmlToMarkdown.js';
import assert from 'assert';

console.log("Starting htmlToMarkdown Comprehensive Tests...");

const runTest = (name, fn) => {
  try {
    fn();
    console.log(`✅ [PASS] ${name}`);
  } catch (e) {
    console.error(`❌ [FAIL] ${name}:`, e.message);
    process.exit(1);
  }
};

// 1. Standard Article Test
runTest("Standard Article", () => {
  const html = `
    <html><head><title>Test Article</title></head>
    <body>
      <div class="main"><h1>Hello World</h1><p>Content</p></div>
    </body></html>`;
  const res = htmlToMarkdown(html);
  assert(res.includes("Hello World"), "Missing heading");
});

// 2. Empty Input
runTest("Empty Input", () => {
  const res = htmlToMarkdown("");
  // JSDOM("") -> empty body. Turndown("") -> "".
  // Should proceed safely.
  assert(typeof res === "string", "Result should be string");
});

// 3. Null Input (Should be caught)
runTest("Null Input", () => {
  // JSDOM(null) behaves like JSDOM("null") string or valid.
  // But let's check if our function handles it without crashing
  const res = htmlToMarkdown(null);
  assert(typeof res === "string", "Result should be string");
});

// 4. Malformed HTML
runTest("Malformed HTML", () => {
  const html = `<div><p>Unclosed Tag`;
  const res = htmlToMarkdown(html);
  assert(res.includes("Unclosed Tag"), "Should recover text");
});

// 5. Non-Article Fallback (Readability returns null)
runTest("Non-Article Fallback", () => {
  const html = `<body>Just some text without structure.</body>`;
  const res = htmlToMarkdown(html);
  // Readability often fails on short text. 
  // Fallback should use doc.body.innerHTML which is "Just some text without structure."
  assert(res.includes("Just some text"), "Should return body content");
});

// 6. Security / Noise Removal (Script/Style) in Fallback
runTest("Script Removal in Fallback", () => {
  // Force fallback by having short content and no article structure
  const html = `<body>
        <script>alert('xss')</script>
        <style>.hide { display: none }</style>
        <p>Safe Content</p>
    </body>`;
  const res = htmlToMarkdown(html);
  assert(res.includes("Safe Content"), "Should keep content");
  assert(!res.includes("alert"), "Should remove script content/tag");
  assert(!res.includes(".hide"), "Should remove style content");
});

// 7. Chaos HTML (Completely broken)
runTest("Chaos HTML", () => {
  const html = `<<<<div class=">>>"><p>Broken <b>Tags <i>everywhere`;
  const res = htmlToMarkdown(html);
  // JSDOM is very resilient. It should extract "Broken Tags everywhere"
  assert(res.includes("Broken"), "Should extract text from chaos");
  assert(res.includes("Tags"), "Should extract text from chaos");
});

console.log("\n🎉 All tests passed!");
