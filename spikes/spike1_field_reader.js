/**
 * Spike 1: Form Field Discovery & Event Listener Extraction
 * Tests reading fields and values from mock portal HTML/DOM.
 */

export function inferKind(nameOrId, labelText) {
  const combined = `${nameOrId} ${labelText}`.toLowerCase();
  if (combined.includes("dob") || combined.includes("birth") || combined.includes("जन्म")) {
    return "date";
  }
  if (combined.includes("district") || combined.includes("जिला")) {
    return "district";
  }
  if (combined.includes("name") || combined.includes("नाम")) {
    return "name";
  }
  if (
    combined.includes("ref") ||
    combined.includes("roll") ||
    combined.includes("number") ||
    combined.includes("संख्या") ||
    combined.includes("id")
  ) {
    return "digits";
  }
  return "text";
}

/**
 * Headless parser to test discovery on static HTML string
 */
export function discoverFieldsFromHtml(htmlContent) {
  const fields = [];
  // Regex match for input fields
  const inputRegex = /<input\s+([^>]+)>/gi;
  let match;

  while ((match = inputRegex.exec(htmlContent)) !== null) {
    const attrs = match[1];

    // Skip hidden and submit
    if (/type=["'](hidden|submit|button)["']/i.test(attrs)) continue;

    const idMatch = attrs.match(/id=["']([^"']+)["']/i);
    const nameMatch = attrs.match(/name=["']([^"']+)["']/i);
    const id = idMatch ? idMatch[1] : (nameMatch ? nameMatch[1] : null);
    if (!id) continue;

    // Find label
    let label = "";
    const labelRegex = new RegExp(`<label[^>]*for=["']${id}["'][^>]*>([\\s\\S]*?)<\\/label>`, "i");
    const labelMatch = htmlContent.match(labelRegex);
    if (labelMatch) {
      // Strip tags
      label = labelMatch[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    } else {
      const placeholderMatch = attrs.match(/placeholder=["']([^"']+)["']/i);
      label = placeholderMatch ? placeholderMatch[1] : id;
    }

    const isRequired = /required/i.test(attrs) || label.includes("*");
    const cleanLabel = label.replace(/\*/g, "").trim();
    const kind = inferKind(id, cleanLabel);

    fields.push({
      id,
      label: cleanLabel,
      required: isRequired,
      kind
    });
  }

  return fields;
}
