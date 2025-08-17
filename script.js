const checkButton = document.getElementById("checkButton");
const loader = document.getElementById("loader");
const resultsDiv = document.getElementById("results");
const referencesText = document.getElementById("references");

checkButton.addEventListener("click", verifyReferences);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function queryByDOI(doi) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "ReferenceCheckerWebApp/1.0 (your-email@example.com)",
      },
    });
    if (response.status === 404) {
      return null; // DOI not found
    }
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    const item = data.message;
    const title =
      item.title && item.title.length > 0 ? item.title[0] : "No Title Found";
    return `✅ <strong>Verified by DOI on CrossRef:</strong> '${title}'`;
  } catch (error) {
    console.error("DOI API Error:", error);
    return `⚠️ <strong>Error checking DOI:</strong> ${error.message}`;
  }
}

async function queryByISBN(isbn) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(
    isbn
  )}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();

    if (data.totalItems > 0) {
      const volumeInfo = data.items[0].volumeInfo;
      return `✅ <strong>Verified by ISBN on Google Books:</strong> '${
        volumeInfo.title
      }' by ${volumeInfo.authors.join(", ")}`;
    }
    return null; // ISBN not found
  } catch (error) {
    console.error("ISBN API Error:", error);
    return `⚠️ <strong>Error checking ISBN:</strong> ${error.message}`;
  }
}

// --- Query CrossRef for Academic Papers by text ---
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
  return null; // No match found
}

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
    .filter((ref) => ref.trim() !== "" && !ref.trim().startsWith("#"));

  for (const originalRef of references) {
    let cleanedRef = originalRef.trim().replace(/^['"]|['"]$/g, "");
    let finalStatus = null;
    let statusClass = "fail";

    const parts = cleanedRef.split(",");
    const author = parts[0]?.trim();
    const title = parts[1]?.trim();
    const identifier = parts[2]?.trim();

    if (identifier) {
      if (identifier.startsWith("10.")) {
        finalStatus = await queryByDOI(identifier);
      } else if (/^(\d{10}|\d{13})$/.test(identifier.replace(/-/g, ""))) {
        finalStatus = await queryByISBN(identifier);
      }
    }

    if (!finalStatus) {
      if (!author || !title) {
        finalStatus = `⚠️ <strong>Invalid Format:</strong> Requires at least 'Author, Title'.`;
      } else {
        finalStatus = await queryCrossRef(author, title);
        if (!finalStatus) {
          finalStatus = await queryGoogleBooks(author, title);
        }
      }
    }

    if (finalStatus) {
      statusClass = finalStatus.startsWith("⚠️") ? "error" : "success";
    } else {
      finalStatus = `❌ <strong>Unverified / Potentially Fake</strong>`;
      statusClass = "fail";
    }

    const resultHTML = `
            <div class="result-item result-item-${statusClass}">
                <div class="ref-title">${originalRef}</div>
                <div class="status status-${statusClass}">${finalStatus}</div>
            </div>`;
    resultsDiv.innerHTML += resultHTML;
    await sleep(500);
  }
  loader.style.display = "none";
  checkButton.disabled = false;
}
