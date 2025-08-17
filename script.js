// Get elements from the DOM
const checkButton = document.getElementById("checkButton");
const loader = document.getElementById("loader");
const resultsDiv = document.getElementById("results");
const referencesText = document.getElementById("references");

// Add event listener to the button
checkButton.addEventListener("click", verifyReferences);

// --- Helper function to pause between API calls ---
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Query functions for direct ID lookups (unchanged) ---
async function queryByDOI(doi) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "ReferenceCheckerWebApp/1.0 (mailto:your-email@example.com)",
      },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    const item = data.message;
    const title =
      item.title && item.title.length > 0 ? item.title[0] : "No Title Found";
    return {
      status: "verified",
      message: `✅ <strong>Verified by DOI on CrossRef:</strong> '${title}'`,
    };
  } catch (error) {
    console.error("DOI API Error:", error);
    return {
      status: "error",
      message: `⚠️ <strong>Error checking DOI:</strong> ${error.message}`,
    };
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
      return {
        status: "verified",
        message: `✅ <strong>Verified by ISBN on Google Books:</strong> '${
          volumeInfo.title
        }' by ${volumeInfo.authors.join(", ")}`,
      };
    }
    return null;
  } catch (error) {
    console.error("ISBN API Error:", error);
    return {
      status: "error",
      message: `⚠️ <strong>Error checking ISBN:</strong> ${error.message}`,
    };
  }
}

// --- NEW: Title-first search logic ---
async function queryByTitle(authorQuery, titleQuery) {
  // Helper function to check for author match
  const checkAuthor = (apiAuthors, userAuthor) => {
    if (!apiAuthors || apiAuthors.length === 0) return false;
    const userLastName = userAuthor
      .split(",")[0]
      .split(" ")
      .pop()
      .toLowerCase();
    return apiAuthors.some((name) => name.toLowerCase().includes(userLastName));
  };

  // 1. Search CrossRef by title
  const crossrefUrl = `https://api.crossref.org/works?query.title=${encodeURIComponent(
    titleQuery
  )}&rows=5`;
  try {
    const response = await fetch(crossrefUrl, {
      headers: {
        "User-Agent":
          "ReferenceCheckerWebApp/1.0 (mailto:your-email@example.com)",
      },
    });
    const data = await response.json();
    if (data.message.items && data.message.items.length > 0) {
      for (const item of data.message.items) {
        const apiTitle = ((item.title && item.title[0]) || "").toLowerCase();
        // Use a stricter title match
        if (apiTitle.includes(titleQuery.toLowerCase())) {
          const apiAuthorsList = (item.author || []).map((a) =>
            `${a.given || ""} ${a.family || ""}`.trim()
          );
          if (checkAuthor(apiAuthorsList, authorQuery)) {
            const doi = item.DOI || "N/A";
            return {
              status: "verified",
              message: `✅ <strong>Verified on CrossRef:</strong> '${item.title[0]}' | <strong>DOI:</strong> ${doi}`,
            };
          } else {
            return {
              status: "potential",
              message: `⚠️ <strong>Potential Match on CrossRef:</strong> Title found, but author '${authorQuery}' did not match the result's authors: '${apiAuthorsList.join(
                ", "
              )}'.`,
            };
          }
        }
      }
    }
  } catch (e) {
    console.error("CrossRef Title Search Error:", e);
  }

  // 2. Search Google Books by title
  const gbooksUrl = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(
    titleQuery
  )}`;
  try {
    const response = await fetch(gbooksUrl);
    const data = await response.json();
    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        const volumeInfo = item.volumeInfo || {};
        const apiTitle = (volumeInfo.title || "").toLowerCase();
        // Use a stricter title match
        if (apiTitle.includes(titleQuery.toLowerCase())) {
          const apiAuthors = volumeInfo.authors || [];
          if (checkAuthor(apiAuthors, authorQuery)) {
            return {
              status: "verified",
              message: `✅ <strong>Verified on Google Books:</strong> '${
                volumeInfo.title
              }' by ${apiAuthors.join(", ")}`,
            };
          } else {
            return {
              status: "potential",
              message: `⚠️ <strong>Potential Match on Google Books:</strong> Title found, but author '${authorQuery}' did not match result's authors: '${apiAuthors.join(
                ", "
              )}'.`,
            };
          }
        }
      }
    }
  } catch (e) {
    console.error("Google Books Title Search Error:", e);
  }

  return null; // No match found anywhere
}

// --- Main function to orchestrate the checks (UPDATED) ---
async function verifyReferences() {
  checkButton.disabled = true;
  loader.style.display = "block";
  resultsDiv.innerHTML = "";
  const references = referencesText.value
    .split("\n")
    .filter((ref) => ref.trim() !== "" && !ref.trim().startsWith("#"));

  for (const originalRef of references) {
    let cleanedRef = originalRef.replace(/^[\s'"]+|[\s'"]+$/g, "");
    let result = null;
    let finalStatus = "";
    let statusClass = "fail";

    const parts = cleanedRef.split(",");
    const author = parts[0]?.replace(/^[\s'"]+|[\s'"]+$/g, "");
    const title = parts[1]?.replace(/^[\s'"]+|[\s'"]+$/g, "");
    const identifier = parts[2]?.replace(/^[\s'"]+|[\s'"]+$/g, "");

    // Step 1: Prioritize direct identifier search
    if (identifier) {
      if (identifier.startsWith("10.")) {
        result = await queryByDOI(identifier);
      } else if (/^(\d{10}|\d{13})$/.test(identifier.replace(/-/g, ""))) {
        result = await queryByISBN(identifier);
      }
    }

    // Step 2: Fallback to title-first search
    if (!result) {
      if (!author || !title) {
        result = {
          status: "error",
          message: `⚠️ <strong>Invalid Format:</strong> Requires at least 'Author, Title'.`,
        };
      } else {
        result = await queryByTitle(author, title);
      }
    }

    // Determine final status message
    if (result) {
      finalStatus = result.message;
      if (result.status === "verified") statusClass = "success";
      else if (result.status === "potential")
        statusClass = "error"; // Use 'error' style for visibility
      else if (result.status === "error") statusClass = "error";
    } else {
      finalStatus = `❌ <strong>Unverified / Potentially Fake</strong>`;
      statusClass = "fail";
    }

    // Append result to the page
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
