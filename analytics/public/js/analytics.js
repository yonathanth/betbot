// BetBot Analytics - Shared JavaScript Functions

// Modal Management
function showModal(title, content) {
  const modalOverlay = document.getElementById("modal-overlay");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");

  modalTitle.textContent = title;
  modalBody.innerHTML = content;
  modalOverlay.classList.remove("hidden");
}

function hideModal() {
  const modalOverlay = document.getElementById("modal-overlay");
  modalOverlay.classList.add("hidden");
}

// Loading State Management
function showLoading() {
  const loadingOverlay = document.getElementById("loading-overlay");
  loadingOverlay.classList.remove("hidden");
}

function hideLoading() {
  const loadingOverlay = document.getElementById("loading-overlay");
  loadingOverlay.classList.add("hidden");
}

// AJAX Helper Functions
async function fetchData(url) {
  try {
    showLoading();
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Fetch error:", error);
    showModal(
      "Error",
      `<p class="error-message">Failed to load data: ${error.message}</p>`
    );
    throw error;
  } finally {
    hideLoading();
  }
}

// Number Formatting
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}

// Date Formatting
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Table Creation Helpers
function createTable(headers, rows, onRowClick = null) {
  let html = '<table class="data-table"><thead><tr>';

  // Add headers
  headers.forEach((header) => {
    html += `<th>${header}</th>`;
  });
  html += "</tr></thead><tbody>";

  // Add rows
  if (rows.length === 0) {
    html += `<tr><td colspan="${headers.length}" style="text-align: center; padding: 2rem;">No data available</td></tr>`;
  } else {
    rows.forEach((row, index) => {
      const rowData = Array.isArray(row) ? row : Object.values(row);
      const clickHandler = onRowClick
        ? ` onclick="${onRowClick}(event, ${index})"`
        : "";
      html += "<tr" + clickHandler + ">";
      rowData.forEach((cell) => {
        html += `<td>${cell}</td>`;
      });
      html += "</tr>";
    });
  }

  html += "</tbody></table>";
  return html;
}

// Status Badge Creation
function createStatusBadge(status) {
  const statusClasses = {
    published: "status-published",
    rented: "status-rented",
    pending: "status-pending",
    rejected: "status-rejected",
  };

  const className = statusClasses[status] || "status-pending";
  return `<span class="status-badge ${className}">${status}</span>`;
}

// User Type Badge Creation
function createUserTypeBadge(userType) {
  const typeClasses = {
    broker: "user-type-broker",
    owner: "user-type-owner",
    tenant: "user-type-tenant",
  };

  const className = typeClasses[userType] || "";
  const displayType = userType || "None";
  return `<span class="status-badge ${className}">${displayType}</span>`;
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  // Modal close handlers
  const modalClose = document.getElementById("modal-close");
  const modalOverlay = document.getElementById("modal-overlay");

  if (modalClose) {
    modalClose.addEventListener("click", hideModal);
  }

  if (modalOverlay) {
    modalOverlay.addEventListener("click", function (e) {
      if (e.target === modalOverlay) {
        hideModal();
      }
    });
  }

  // ESC key to close modal
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      hideModal();
    }
  });

  console.log("BetBot Analytics initialized");
});
