const checkButton = document.getElementById("checkButton");
const loader = document.getElementById("loader");
const resultsDiv = document.getElementById("results");
const referencesText = document.getElementById("references");

checkButton.addEventListener("click", verifyReferences);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Query CrossRef for Academic Papers ---
async function queryCrossRef(authorQuery, titleQuery) {
  const url = `https://api.crossref.org/works?query.author=${encodeURIComponent(
    authorQuery
  )}&query.title=${encodeURIComponent(titleQuery)}&rows=5`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ReferenceCheckerWebApp/1.0 (your-email@example.com)",
      },
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();

    if (data.message.items && data.message.items.length > 0) {
      for (const item of data.message.items) {
        const apiTitle = ((item.title && item.title[0]) || "").toLowerCase();
        const apiAuthors = (item.author || []).map((a) =>
          `${a.given || ""} ${a.family || ""}`.trim().toLowerCase()
        );

        const titleMatches = apiTitle.includes(titleQuery.toLowerCase());
        const authorLastName = authorQuery.split(" ").pop().toLowerCase();
        const authorMatches = apiAuthors.some((name) =>
          name.includes(authorLastName)
        );

        if (titleMatches && authorMatches) {
          const doi = item.DOI || "N/A";
          return `✅ <strong>Verified on CrossRef (Paper):</strong> '${item.title[0]}' | <strong>DOI:</strong> ${doi}`;
        }
      }
    }
  } catch (error) {
    console.error("CrossRef API Error:", error);
    return `⚠️ <strong>Error connecting to CrossRef API:</strong> ${error.message}`;
  }
  return null;
}

// --- Query for Books ---
async function queryGoogleBooks(authorQuery, titleQuery) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(
    titleQuery
  )}+inauthor:${encodeURIComponent(authorQuery)}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();

    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        const volumeInfo = item.volumeInfo || {};
        const apiTitle = (volumeInfo.title || "").toLowerCase();
        const apiAuthors = (volumeInfo.authors || []).map((a) =>
          a.toLowerCase()
        );

        const titleMatches = apiTitle.includes(titleQuery.toLowerCase());
        const authorMatches = apiAuthors.some((name) =>
          name.includes(authorQuery.toLowerCase())
        );

        if (titleMatches && authorMatches) {
          return `✅ <strong>Verified on Google Books:</strong> '${
            volumeInfo.title
          }' by ${volumeInfo.authors.join(", ")}`;
        }
      }
    }
  } catch (error) {
    console.error("Google Books API Error:", error);
    return `⚠️ <strong>Error connecting to Google Books API:</strong> ${error.message}`;
  }
  return null; // No match found
}

async function verifyReferences() {
  checkButton.disabled = true;
  loader.style.display = "block";
  resultsDiv.innerHTML = "";

  const references = referencesText.value
    .split("\n")
    .filter((ref) => ref.trim() !== "");

  for (const originalRef of references) {
    let cleanedRef = originalRef.trim();
    cleanedRef = cleanedRef.replace(/^['"]|['"]$/g, "");

    let statusClass = "fail"; // Default to fail
    let finalStatus = "";

    const parts = cleanedRef.split(",");
    if (parts.length < 2) {
      finalStatus = `⚠️ <strong>Invalid Format:</strong> Must be 'Author, Title'.`;
      statusClass = "error";
    } else {
      const author = parts[0].trim();
      const title = parts.slice(1).join(",").trim();

      // 1. Try CrossRef
      let result = await queryCrossRef(author, title);

      // 2. Fallback to Google Books
      if (!result) {
        result = await queryGoogleBooks(author, title);
      }

      // 3. Determine final status
      if (result) {
        finalStatus = result;
        statusClass = result.startsWith("⚠️") ? "error" : "success";
      } else {
        finalStatus = `❌ <strong>Unverified / Potentially Fake</strong>`;
      }
    }

    // Append result to the page, showing the user's original input
    const resultHTML = `
            <div class="result-item result-item-${statusClass}">
                <div class="ref-title">${originalRef}</div>
                <div class="status status-${statusClass}">${finalStatus}</div>
            </div>
        `;
    resultsDiv.innerHTML += resultHTML;

    await sleep(500); // Polite pause between requests
  }

  loader.style.display = "none";
  checkButton.disabled = false;
}
