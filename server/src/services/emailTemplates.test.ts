import test from "node:test";
import assert from "node:assert/strict";
import { previewEmail, resetEmail } from "./emailTemplates.js";

test("email HTML uses the site palette and escapes account text and links", () => {
  const content = resetEmail('<Preetham & Co>', 'https://example.com/reset?token=a&b=1');
  assert.match(content.html, /#9cf33b/);
  assert.match(content.html, /#111317/);
  assert.match(content.html, /&lt;Preetham &amp; Co&gt;/);
  assert.match(content.html, /token=a&amp;b=1/);
  assert.doesNotMatch(content.html, /Hi <Preetham/);
  assert.match(content.text, /https:\/\/example.com\/reset\?token=a&b=1/);
  assert.match(previewEmail(content).html, /Preview only \/ not a live reminder/);
});
