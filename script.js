const checkButton = document.getElementById("checkButton");
const loader = document.getElementById("loader");
const resultsDiv = document.getElementById("results");
const referencesText = document.getElementById("references");
const historyList = document.getElementById("historyList");
const clearHistoryButton = document.getElementById("clearHistoryButton");
const themeToggle = document.getElementById("theme-toggle");

checkButton.addEventListener("click", verifyReferences);
clearHistoryButton.addEventListener("click", clearHistory);
document.addEventListener("DOMContentLoaded", () => {
  loadHistory();
  initializeTheme();
});
themeToggle.addEventListener("change", toggleTheme);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function initializeTheme() {
  const savedTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-bs-theme", savedTheme);
  themeToggle.checked = savedTheme === "dark";
}

function toggleTheme() {
  const theme = themeToggle.checked ? "dark" : "light";
  document.documentElement.setAttribute("data-bs-theme", theme);
  localStorage.setItem("theme", theme);
}

function loadHistory() {
  const history = JSON.parse(localStorage.getItem("refHistory")) || [];
  historyList.innerHTML = "";
  history.forEach((query) => {
    const li = document.createElement("li");
    li.className = "list-group-item list-group-item-action";
    li.textContent = query.join(", "); // Display cleaned refs
    li.style.cursor = "pointer";
    li.addEventListener("click", () => {
      referencesText.value = query.join("\n");
    });
    historyList.appendChild(li);
  });
}

function addToHistory(query) {
  let history = JSON.parse(localStorage.getItem("refHistory")) || [];
  const queryStr = JSON.stringify(query);
  if (!history.find((h) => JSON.stringify(h) === queryStr)) {
    history.unshift(query);
    if (history.length > 10) {
      history.pop();
    }
    localStorage.setItem("refHistory", JSON.stringify(history));
    loadHistory();
  }
}

function clearHistory() {
  localStorage.removeItem("refHistory");
  loadHistory();
}

async function queryByDOI(doi) {
  const url = `https://doi.org/${encodeURIComponent(doi)}`;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.citationstyles.csl+json",
      },
    });
    if (response.status === 404) {
      return null; // DOI not found
    }
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    const title = data.title || "No Title Found";
    return {
      status: "verified",
      message: `✅ <strong>Verified by DOI on doi.org:</strong> '${title}'`,
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

async function intelligentTitleSearch(authorQuery, titleQuery) {
  let potentialResult = null;

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
          } else if (!potentialResult) {
            potentialResult = {
              status: "potential",
              message: `⚠️ <strong>Potential Match on CrossRef:</strong> Title found, but author '${authorQuery}' did not match result's authors: '${apiAuthorsList.join(
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

  // 2. Search Google Books by title. This runs if no VERIFIED match was found on CrossRef.
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
        if (apiTitle.includes(titleQuery.toLowerCase())) {
          const apiAuthors = volumeInfo.authors || [];
          if (checkAuthor(apiAuthors, authorQuery)) {
            let isbn = "N/A";
            for (const item of volumeInfo.industryIdentifiers) {
              isbn = item.identifier;
              if (item.type === "ISBN_13") {
                break;
              }
            }

            return {
              status: "verified",
              message: `✅ <strong>Verified on Google Books:</strong>'${
                volumeInfo.title
              }' by ${apiAuthors.join(", ")} | <strong>ISBN:</strong> ${isbn}`,
            };
          }
        }
      }
    }
  } catch (e) {
    console.error("Google Books Title Search Error:", e);
  }

  return potentialResult;
}

async function verifyReferences() {
  const query = referencesText.value;
  if (query.trim() === "") return;

  checkButton.disabled = true;
  loader.style.display = "block";
  resultsDiv.innerHTML = "";
  const references = query
    .split("\n")
    .filter((ref) => ref.trim() !== "" && !ref.trim().startsWith("#"));

  const cleanedRefs = [];

  for (const originalRef of references) {
    let cleanedRef = originalRef.replace(/^["\s']+|[\s'" ]+$/g, "");
    cleanedRefs.push(cleanedRef);
    let result = null;
    let finalStatus = "";
    let statusClass = "danger";

    const parts = cleanedRef.split(",");
    const author = parts[0]?.replace(/^["\s']+|[\s'" ]+$/g, "");
    const title = parts[1]?.replace(/^["\s']+|[\s'" ]+$/g, "");
    const identifier = parts[2]?.replace(/^["\s']+|[\s'" ]+$/g, "");

    // Step 1: Prioritize direct identifier search
    if (identifier) {
      if (identifier.startsWith("10.")) {
        result = await queryByDOI(identifier);
      } else if (/^(\d{10}|\d{13})$/.test(identifier.replace(/-/g, ""))) {
        result = await queryByISBN(identifier);
      }
    }

    // Step 2: Fallback to the new intelligent title-first search
    if (!result) {
      if (!author || !title) {
        result = {
          status: "error",
          message: `⚠️ <strong>Invalid Format:</strong> Requires at least 'Author, Title'.`,
        };
      } else {
        result = await intelligentTitleSearch(author, title);
      }
    }

    if (result) {
      finalStatus = result.message;
      if (result.status === "verified") statusClass = "success";
      else if (result.status === "potential") statusClass = "warning";
      else if (result.status === "error") statusClass = "danger";
    } else {
      finalStatus = `❌ <strong>Unverified / Potentially Fake</strong>`;
      statusClass = "danger";
    }

    const resultHTML = `
      <div class="card border-${statusClass} mb-3">
        <div class="card-body">
          <h5 class="card-title">${originalRef}</h5>
          <p class="card-text">${finalStatus}</p>
        </div>
      </div>`;
    resultsDiv.innerHTML += resultHTML;
    await sleep(500);
  }

  if (cleanedRefs.length > 0) {
    addToHistory(cleanedRefs);
  }

  loader.style.display = "none";
  checkButton.disabled = false;
}
