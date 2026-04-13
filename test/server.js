const express = require("express");
const path = require("path");
const basicRoutes = require("./basic");
const buyerRoutes = require("./buyer");
const sellerRoutes = require("./seller");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(__dirname, "style.css"));
});

app.get("/", (req, res) => {
  res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>DB Test UI</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <header class="page-header">
      <h1>DB Test UI</h1>
    </header>

    <main>
      <section class="panel">
        <h2>Dashboards</h2>
        <ul>
          <li><a href="/basic">Basic</a></li>
          <li><a href="/buyer">Buyer</a></li>
          <li><a href="/seller">Seller</a></li>
          <li><a href="/concurrency">Concurrency</a></li>
        </ul>

        <div class="row">
          <button id="load-stats" type="button">Load stats</button>
          <div id="dashboard-stats" class="output"></div>
        </div>
        <div id="stats-table" class="table-wrap"></div>
      </section>
    </main>
    <script>
      const byId = (id) => document.getElementById(id);
      const formatMs = (value) => (Number.isFinite(value) ? value.toFixed(2) : "-");

      const setStatsOutput = (message, isError = false) => {
        const el = byId("dashboard-stats");
        if (!el) return;
        el.textContent = message;
        el.classList.toggle("error", isError);
      };

      const setStatsTable = (rows) => {
        const target = byId("stats-table");
        if (!target) return;
        if (!rows) {
          target.innerHTML = "";
          return;
        }

        const header = "<tr><th>Table</th><th>Count</th></tr>";
        const body = Object.entries(rows)
          .map(([table, count]) => \`<tr><td>\${table}</td><td>\${count}</td></tr>\`)
          .join("");

        target.innerHTML = \`<table>\${header}<tbody>\${body}</tbody></table>\`;
      };

      byId("load-stats").addEventListener("click", async () => {
        setStatsOutput("Loading...");
        setStatsTable(null);
        try {
          const response = await fetch("/api/stats");
          const payload = await response.json();
          if (!response.ok || payload.ok === false) {
            throw new Error(payload.error || "Request failed");
          }
          setStatsOutput(\`Query time: \${formatMs(payload.durationMs)} ms\`);
          setStatsTable(payload.counts);
        } catch (error) {
          setStatsOutput(error.message, true);
        }
      });
    </script>
  </body>
</html>`);
});

app.get("/basic", (req, res) => {
  res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>DB Test UI - Basic</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <header class="page-header">
      <a class="muted" href="/">← Dashboard</a>
      <h1>Basic</h1>
    </header>

    <main>
      <section class="panel">
        <form id="create-user-form" class="stack">
          <h3>Create user</h3>
          <div class="grid">
            <label>Login <input name="login" required /></label>
            <label>Password <input name="password" required type="password" /></label>
            <label>Name <input name="name" required /></label>
            <label>Surname <input name="surname" required /></label>
            <label>Email <input name="email" required type="email" /></label>
          </div>
          <button type="submit">Create user</button>
          <div id="create-user-output" class="output"></div>
        </form>

        <form id="update-user-form" class="stack">
          <h3>Update user details</h3>
          <div class="grid">
            <label>User ID <input name="user_id" type="number" min="1" required /></label>
            <label>Name <input name="name" required /></label>
            <label>Surname <input name="surname" required /></label>
            <label>Email (optional) <input name="email" type="email" /></label>
          </div>
          <button type="submit">Update details</button>
          <div id="update-user-output" class="output"></div>
        </form>

        <form id="item-history-form" class="stack">
          <h3>Item history</h3>
          <div class="grid">
            <label>Item ID <input name="item_id" type="number" min="1" required /></label>
          </div>
          <button type="submit">Load history</button>
          <button id="verify-item-history" type="button">Verify chain</button>
          <div id="item-history-output" class="output"></div>
          <div id="item-history-table" class="table-wrap"></div>
        </form>
      </section>
    </main>

    <script>
      const byId = (id) => document.getElementById(id);
      const formatMs = (value) => (Number.isFinite(value) ? value.toFixed(2) : "-");

      const setOutput = (id, message, isError = false) => {
        const el = byId(id);
        if (!el) return;
        el.textContent = message;
        el.classList.toggle("error", isError);
      };

      const setTable = (id, html) => {
        const el = byId(id);
        if (!el) return;
        el.innerHTML = html || "";
      };

      const fetchJson = async (url, options = {}) => {
        const response = await fetch(url, options);
        const payload = await response.json();
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || "Request failed");
        }
        return payload;
      };

      const renderTable = (rows, columns, actionBuilder) => {
        if (!rows || rows.length === 0) {
          return "<p class=\\"muted\\">No rows.</p>";
        }

        const header = columns.map((col) => \`<th>\${col.label}</th>\`).join("");
        const body = rows
          .map((row) => {
            const cells = columns
              .map((col) => \`<td>\${row[col.key] ?? ""}</td>\`)
              .join("");
            const actions = actionBuilder ? \`<td>\${actionBuilder(row)}</td>\` : "";
            return \`<tr>\${cells}\${actions}</tr>\`;
          })
          .join("");

        const actionHeader = actionBuilder ? "<th>Actions</th>" : "";
        return \`<table><thead><tr>\${header}\${actionHeader}</tr></thead><tbody>\${body}</tbody></table>\`;
      };

      const bindForm = (formId, handler) => {
        const form = byId(formId);
        if (!form) return;
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          handler(new FormData(form));
        });
      };

      bindForm("create-user-form", async (formData) => {
        setOutput("create-user-output", "Creating...");
        try {
          const payload = await fetchJson("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(formData)),
          });
          setOutput("create-user-output", \`Created user_id \${payload.user_id} (t=\${formatMs(payload.durationMs)} ms)\`);
        } catch (error) {
          setOutput("create-user-output", error.message, true);
        }
      });

      bindForm("update-user-form", async (formData) => {
        const userId = formData.get("user_id");
        if (!userId) {
          return setOutput("update-user-output", "user_id is required", true);
        }

        const payloadBody = {
          name: formData.get("name"),
          surname: formData.get("surname"),
          email: formData.get("email") || undefined,
        };

        setOutput("update-user-output", "Updating...");
        try {
          const payload = await fetchJson(\`/api/users/\${userId}/details\`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadBody),
          });
          setOutput("update-user-output", \`Updated (t=\${formatMs(payload.durationMs)} ms)\`);
        } catch (error) {
          setOutput("update-user-output", error.message, true);
        }
      });

      bindForm("item-history-form", async (formData) => {
        const itemId = formData.get("item_id");
        if (!itemId) {
          return setOutput("item-history-output", "item_id is required", true);
        }

        setOutput("item-history-output", "Loading...");
        setTable("item-history-table", "");

        try {
          const payload = await fetchJson(\`/api/items/\${itemId}/history\`);
          setOutput("item-history-output", \`Entries: \${payload.count} (t=\${formatMs(payload.durationMs)} ms)\`);
          const columns = [
            { key: "id", label: "Ledger ID" },
            { key: "prev_id", label: "Prev ID" },
            { key: "event_type", label: "Event" },
            { key: "creator_id", label: "Creator" },
            { key: "created_at", label: "Created at" },
            { key: "chain_hash", label: "Chain hash" },
            { key: "event_hash", label: "Event hash" },
          ];
          setTable("item-history-table", renderTable(payload.rows, columns));
        } catch (error) {
          setOutput("item-history-output", error.message, true);
        }
      });

      const verifyButton = byId("verify-item-history");
      if (verifyButton) {
        verifyButton.addEventListener("click", async () => {
          const form = byId("item-history-form");
          const itemId = form ? new FormData(form).get("item_id") : "";
          if (!itemId) {
            return setOutput("item-history-output", "item_id is required", true);
          }

          setOutput("item-history-output", "Verifying...");
          try {
            const payload = await fetchJson(\`/api/items/\${itemId}/verify\`);
            setOutput(
              "item-history-output",
              \`Verify: \${payload.is_valid} (t=\${formatMs(payload.durationMs)} ms)\`
            );
          } catch (error) {
            setOutput("item-history-output", error.message, true);
          }
        });
      }
    </script>
  </body>
</html>`);
});

app.get("/buyer", (req, res) => {
  res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>DB Test UI - Buyer</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <header class="page-header">
      <a class="muted" href="/">← Dashboard</a>
      <h1>Buyer</h1>
    </header>

    <main>
      <section class="panel">
        <form id="buyer-list-offers-form" class="stack">
          <h3>List offers (limit 999)</h3>
          <div class="grid">
            <label>Title <input name="title" /></label>
            <label>SN <input name="sn" /></label>
            <label>Creator ID <input name="creator_id" type="number" min="1" /></label>
          </div>
          <button type="submit">Search offers</button>
          <div id="offers-output" class="output"></div>
          <div id="offers-table" class="table-wrap"></div>
        </form>

        <form id="buyer-place-bid-form" class="stack">
          <h3>Place bid</h3>
          <div class="grid">
            <label>Bidder ID <input name="bidder_id" type="number" min="1" required /></label>
            <label>Offer ID <input name="offer_id" type="number" min="1" required /></label>
            <label>Value <input name="value" type="number" step="0.01" required /></label>
          </div>
          <button type="submit">Place bid</button>
          <div id="buyer-place-bid-output" class="output"></div>
        </form>

        <form id="buyer-bids-form" class="stack">
          <h3>My bids</h3>
          <div class="grid">
            <label>User ID <input id="buyer-user-id" name="user_id" type="number" min="1" required /></label>
          </div>
          <button type="submit">Load bids</button>
          <div id="buyer-bids-output" class="output"></div>
          <div id="buyer-bids-table" class="table-wrap"></div>
        </form>

        <form id="buyer-list-conversations-form" class="stack">
          <h3>List conversations</h3>
          <div class="grid">
            <label>Offer ID <input name="offer_id" type="number" min="1" required /></label>
            <label>Bid ID (optional) <input name="bid_id" type="number" min="1" /></label>
          </div>
          <button type="submit">Load conversations</button>
          <div id="buyer-conversations-output" class="output"></div>
          <div id="buyer-conversations-table" class="table-wrap"></div>
        </form>

        <form id="buyer-post-conversation-form" class="stack">
          <h3>Post message (comment_item_offer)</h3>
          <div class="grid">
            <label>Commenter ID <input name="commenter_id" type="number" min="1" required /></label>
            <label>Offer ID <input name="offer_id" type="number" min="1" required /></label>
            <label>Subject <input name="subject" /></label>
            <label>Contents <input name="contents" required /></label>
          </div>
          <button type="submit">Post message</button>
          <div id="buyer-post-conversation-output" class="output"></div>
        </form>
      </section>
    </main>

    <script>
      const byId = (id) => document.getElementById(id);
      const formatMs = (value) => (Number.isFinite(value) ? value.toFixed(2) : "-");

      const setOutput = (id, message, isError = false) => {
        const el = byId(id);
        if (!el) return;
        el.textContent = message;
        el.classList.toggle("error", isError);
      };

      const setTable = (id, html) => {
        const el = byId(id);
        if (!el) return;
        el.innerHTML = html || "";
      };

      const toQueryString = (params) =>
        Object.entries(params)
          .filter(([, value]) => value !== "" && value !== undefined && value !== null)
          .map(([key, value]) => \`\${encodeURIComponent(key)}=\${encodeURIComponent(value)}\`)
          .join("&");

      const fetchJson = async (url, options = {}) => {
        const response = await fetch(url, options);
        const payload = await response.json();
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || "Request failed");
        }
        return payload;
      };

      const renderTable = (rows, columns, actionBuilder) => {
        if (!rows || rows.length === 0) {
          return "<p class=\\"muted\\">No rows.</p>";
        }

        const header = columns.map((col) => \`<th>\${col.label}</th>\`).join("");
        const body = rows
          .map((row) => {
            const cells = columns
              .map((col) => \`<td>\${row[col.key] ?? ""}</td>\`)
              .join("");
            const actions = actionBuilder ? \`<td>\${actionBuilder(row)}</td>\` : "";
            return \`<tr>\${cells}\${actions}</tr>\`;
          })
          .join("");

        const actionHeader = actionBuilder ? "<th>Actions</th>" : "";
        return \`<table><thead><tr>\${header}\${actionHeader}</tr></thead><tbody>\${body}</tbody></table>\`;
      };

      const bindForm = (formId, handler) => {
        const form = byId(formId);
        if (!form) return;
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          handler(new FormData(form));
        });
      };

      bindForm("buyer-list-offers-form", async (formData) => {
        setOutput("offers-output", "Loading...");
        setTable("offers-table", "");
        const query = toQueryString({
          title: formData.get("title"),
          sn: formData.get("sn"),
          creator_id: formData.get("creator_id"),
        });

        try {
          const payload = await fetchJson(\`/api/offers?\${query}\`);
          setOutput("offers-output", \`Offers: \${payload.count} (t=\${formatMs(payload.durationMs)} ms)\`);
          const columns = [
            { key: "offer_id", label: "Offer ID" },
            { key: "status", label: "Status" },
            { key: "price", label: "Price" },
            { key: "item_id", label: "Item ID" },
            { key: "item_title", label: "Title" },
            { key: "item_sn", label: "SN" },
            { key: "creator_id", label: "Creator" },
          ];
          setTable("offers-table", renderTable(payload.rows, columns));
        } catch (error) {
          setOutput("offers-output", error.message, true);
        }
      });

      bindForm("buyer-place-bid-form", async (formData) => {
        setOutput("buyer-place-bid-output", "Placing bid...");
        try {
          const payload = await fetchJson("/api/buyer/bids", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(formData)),
          });
          setOutput("buyer-place-bid-output", \`Placed bid_id \${payload.bid_id} (t=\${formatMs(payload.durationMs)} ms)\`);
        } catch (error) {
          setOutput("buyer-place-bid-output", error.message, true);
        }
      });

      bindForm("buyer-bids-form", async (formData) => {
        const userId = formData.get("user_id");
        if (!userId) {
          return setOutput("buyer-bids-output", "user_id is required", true);
        }

        setOutput("buyer-bids-output", "Loading...");
        setTable("buyer-bids-table", "");

        try {
          const payload = await fetchJson(\`/api/buyer/bids?user_id=\${userId}\`);
          setOutput("buyer-bids-output", \`Bids: \${payload.count} (t=\${formatMs(payload.durationMs)} ms)\`);
          const columns = [
            { key: "bid_id", label: "Bid ID" },
            { key: "bid_status", label: "Bid status" },
            { key: "bid_value", label: "Bid value" },
            { key: "offer_time", label: "Time" },
            { key: "offer_id", label: "Offer ID" },
            { key: "offer_status", label: "Offer status" },
            { key: "item_id", label: "Item ID" },
            { key: "item_title", label: "Title" },
          ];
          setTable(
            "buyer-bids-table",
            renderTable(payload.rows, columns, (row) => {
              const actions = [];
              if (row.bid_status === "PENDING") {
                actions.push(\`<button data-action="cancel-bid" data-id="\${row.bid_id}">Cancel</button>\`);
              }
              if (row.offer_status === "RESERVED") {
                actions.push(\`<button data-action="pay-bid" data-id="\${row.bid_id}">Pay</button>\`);
              }
              if (row.offer_status === "PENDING_TRANSACTION") {
                actions.push(\`<button data-action="ack-bid" data-id="\${row.bid_id}">Acknowledge</button>\`);
              }
              return actions.join(" ");
            })
          );
        } catch (error) {
          setOutput("buyer-bids-output", error.message, true);
        }
      });

      bindForm("buyer-list-conversations-form", async (formData) => {
        const offerId = formData.get("offer_id");
        if (!offerId) {
          return setOutput("buyer-conversations-output", "offer_id is required", true);
        }

        const query = toQueryString({
          offer_id: offerId,
          bid_id: formData.get("bid_id"),
        });

        setOutput("buyer-conversations-output", "Loading...");
        setTable("buyer-conversations-table", "");

        try {
          const payload = await fetchJson(\`/api/buyer/conversations?\${query}\`);
          setOutput("buyer-conversations-output", \`Conversations: \${payload.count} (t=\${formatMs(payload.durationMs)} ms)\`);
          const columns = [
            { key: "conversation_id", label: "ID" },
            { key: "offer_id", label: "Offer" },
            { key: "bid_id", label: "Bid" },
            { key: "commenter_id", label: "Commenter" },
            { key: "subject", label: "Subject" },
            { key: "contents", label: "Contents" },
            { key: "created_at", label: "Created" },
          ];
          setTable("buyer-conversations-table", renderTable(payload.rows, columns));
        } catch (error) {
          setOutput("buyer-conversations-output", error.message, true);
        }
      });

      bindForm("buyer-post-conversation-form", async (formData) => {
        setOutput("buyer-post-conversation-output", "Posting...");
        try {
          const payload = await fetchJson("/api/buyer/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(formData)),
          });
          setOutput("buyer-post-conversation-output", \`Posted conversation_id \${payload.conversation_id} (t=\${formatMs(payload.durationMs)} ms)\`);
        } catch (error) {
          setOutput("buyer-post-conversation-output", error.message, true);
        }
      });

      document.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;

        const action = button.dataset.action;
        const id = button.dataset.id;
        const userId = byId("buyer-user-id")?.value?.trim();
        if (!userId) {
          return alert("Provide User ID in the 'My bids' form first.");
        }

        const actionMap = {
          "cancel-bid": \`/api/buyer/bids/\${id}/cancel\`,
          "pay-bid": \`/api/buyer/bids/\${id}/pay\`,
          "ack-bid": \`/api/buyer/bids/\${id}/ack\`,
        };

        const endpoint = actionMap[action];
        if (!endpoint) return;

        try {
          const payload = await fetchJson(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId }),
          });
          alert(\`Action completed (t=\${formatMs(payload.durationMs)} ms)\`);
        } catch (error) {
          alert(error.message);
        }
      });
    </script>
  </body>
</html>`);
});

app.get("/seller", (req, res) => {
  res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>DB Test UI - Seller</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <header class="page-header">
      <a class="muted" href="/">← Dashboard</a>
      <h1>Seller</h1>
    </header>

    <main>
      <section class="panel">
        <form id="seller-create-item-form" class="stack">
          <h3>Create item</h3>
          <div class="grid">
            <label>Creator ID <input name="creator_id" type="number" min="1" required /></label>
            <label>SN <input name="sn" required /></label>
            <label>Title <input name="title" required /></label>
          </div>
          <button type="submit">Create item</button>
          <div id="seller-create-item-output" class="output"></div>
        </form>

        <form id="seller-register-offer-form" class="stack">
          <h3>Register offer</h3>
          <div class="grid">
            <label>Creator ID <input name="creator_id" type="number" min="1" required /></label>
            <label>Item ID <input name="item_id" type="number" min="1" required /></label>
            <label>Price <input name="price" type="number" step="0.01" required /></label>
            <label>Description <input name="description" /></label>
          </div>
          <button type="submit">Register offer</button>
          <div id="seller-register-offer-output" class="output"></div>
        </form>

        <form id="seller-user-items-form" class="stack">
          <h3>User items</h3>
          <div class="grid">
            <label>User ID <input name="user_id" type="number" min="1" required /></label>
          </div>
          <button type="submit">Load items</button>
          <div id="user-items-output" class="output"></div>
          <div id="user-items-table" class="table-wrap"></div>
        </form>

        <form id="seller-offers-form" class="stack">
          <h3>My offers</h3>
          <div class="grid">
            <label>User ID <input id="seller-user-id" name="user_id" type="number" min="1" required /></label>
          </div>
          <button type="submit">Load offers</button>
          <div id="seller-offers-output" class="output"></div>
          <div id="seller-offers-table" class="table-wrap"></div>
        </form>

        <form id="seller-list-conversations-form" class="stack">
          <h3>List conversations</h3>
          <div class="grid">
            <label>Offer ID <input name="offer_id" type="number" min="1" required /></label>
            <label>Bid ID (optional) <input name="bid_id" type="number" min="1" /></label>
          </div>
          <button type="submit">Load conversations</button>
          <div id="seller-conversations-output" class="output"></div>
          <div id="seller-conversations-table" class="table-wrap"></div>
        </form>

        <form id="seller-post-conversation-form" class="stack">
          <h3>Post message (comment_item_offer)</h3>
          <div class="grid">
            <label>Commenter ID <input name="commenter_id" type="number" min="1" required /></label>
            <label>Offer ID <input name="offer_id" type="number" min="1" required /></label>
            <label>Subject <input name="subject" /></label>
            <label>Contents <input name="contents" required /></label>
          </div>
          <button type="submit">Post message</button>
          <div id="seller-post-conversation-output" class="output"></div>
        </form>
      </section>
    </main>

    <script>
      const byId = (id) => document.getElementById(id);
      const formatMs = (value) => (Number.isFinite(value) ? value.toFixed(2) : "-");

      const setOutput = (id, message, isError = false) => {
        const el = byId(id);
        if (!el) return;
        el.textContent = message;
        el.classList.toggle("error", isError);
      };

      const setTable = (id, html) => {
        const el = byId(id);
        if (!el) return;
        el.innerHTML = html || "";
      };

      const fetchJson = async (url, options = {}) => {
        const response = await fetch(url, options);
        const payload = await response.json();
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || "Request failed");
        }
        return payload;
      };

      const renderTable = (rows, columns, actionBuilder) => {
        if (!rows || rows.length === 0) {
          return "<p class=\\"muted\\">No rows.</p>";
        }

        const header = columns.map((col) => \`<th>\${col.label}</th>\`).join("");
        const body = rows
          .map((row) => {
            const cells = columns
              .map((col) => \`<td>\${row[col.key] ?? ""}</td>\`)
              .join("");
            const actions = actionBuilder ? \`<td>\${actionBuilder(row)}</td>\` : "";
            return \`<tr>\${cells}\${actions}</tr>\`;
          })
          .join("");

        const actionHeader = actionBuilder ? "<th>Actions</th>" : "";
        return \`<table><thead><tr>\${header}\${actionHeader}</tr></thead><tbody>\${body}</tbody></table>\`;
      };

      const bindForm = (formId, handler) => {
        const form = byId(formId);
        if (!form) return;
        form.addEventListener("submit", (event) => {
          event.preventDefault();
          handler(new FormData(form));
        });
      };

      bindForm("seller-create-item-form", async (formData) => {
        setOutput("seller-create-item-output", "Creating item...");
        try {
          const payload = await fetchJson("/api/seller/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(formData)),
          });
          setOutput("seller-create-item-output", \`Created item_id \${payload.item_id} (t=\${formatMs(payload.durationMs)} ms)\`);
        } catch (error) {
          setOutput("seller-create-item-output", error.message, true);
        }
      });

      bindForm("seller-register-offer-form", async (formData) => {
        setOutput("seller-register-offer-output", "Registering offer...");
        try {
          const payload = await fetchJson("/api/seller/offers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(formData)),
          });
          setOutput("seller-register-offer-output", \`Registered offer_id \${payload.offer_id} (t=\${formatMs(payload.durationMs)} ms)\`);
        } catch (error) {
          setOutput("seller-register-offer-output", error.message, true);
        }
      });

      bindForm("seller-user-items-form", async (formData) => {
        const userId = formData.get("user_id");
        if (!userId) {
          return setOutput("user-items-output", "user_id is required", true);
        }

        setOutput("user-items-output", "Loading...");
        setTable("user-items-table", "");

        try {
          const payload = await fetchJson(\`/api/users/\${userId}/items\`);
          setOutput("user-items-output", \`Items: \${payload.count} (t=\${formatMs(payload.durationMs)} ms)\`);
          const columns = [
            { key: "item_id", label: "Item ID" },
            { key: "status", label: "Status" },
            { key: "title", label: "Title" },
            { key: "sn", label: "SN" },
            { key: "ledger_head", label: "Ledger head" },
          ];
          setTable("user-items-table", renderTable(payload.rows, columns));
        } catch (error) {
          setOutput("user-items-output", error.message, true);
        }
      });

      bindForm("seller-offers-form", async (formData) => {
        const userId = formData.get("user_id");
        if (!userId) {
          return setOutput("seller-offers-output", "user_id is required", true);
        }

        setOutput("seller-offers-output", "Loading...");
        setTable("seller-offers-table", "");

        try {
          const payload = await fetchJson(\`/api/seller/offers?user_id=\${userId}\`);
          setOutput("seller-offers-output", \`Offers: \${payload.count} (t=\${formatMs(payload.durationMs)} ms)\`);
          const columns = [
            { key: "offer_id", label: "Offer ID" },
            { key: "status", label: "Status" },
            { key: "price", label: "Price" },
            { key: "item_id", label: "Item ID" },
            { key: "item_title", label: "Title" },
            { key: "item_sn", label: "SN" },
            { key: "bid_count", label: "Bids" },
          ];
          setTable(
            "seller-offers-table",
            renderTable(payload.rows, columns, (row) => {
              const actions = [];
              if (row.status === "ACTIVE") {
                actions.push(\`<button data-action="cancel-offer" data-id="\${row.offer_id}">Cancel</button>\`);
              }
              if (row.status === "RESERVED") {
                actions.push(\`<button data-action="transfer-offer" data-id="\${row.offer_id}">Transfer</button>\`);
              }
              return actions.join(" ");
            })
          );
        } catch (error) {
          setOutput("seller-offers-output", error.message, true);
        }
      });

      bindForm("seller-list-conversations-form", async (formData) => {
        const offerId = formData.get("offer_id");
        if (!offerId) {
          return setOutput("seller-conversations-output", "offer_id is required", true);
        }

        const query = new URLSearchParams({
          offer_id: offerId,
        });

        const bidId = formData.get("bid_id");
        if (bidId) query.set("bid_id", bidId);

        setOutput("seller-conversations-output", "Loading...");
        setTable("seller-conversations-table", "");

        try {
          const payload = await fetchJson(\`/api/seller/conversations?\${query.toString()}\`);
          setOutput("seller-conversations-output", \`Conversations: \${payload.count} (t=\${formatMs(payload.durationMs)} ms)\`);
          const columns = [
            { key: "conversation_id", label: "ID" },
            { key: "offer_id", label: "Offer" },
            { key: "bid_id", label: "Bid" },
            { key: "commenter_id", label: "Commenter" },
            { key: "subject", label: "Subject" },
            { key: "contents", label: "Contents" },
            { key: "created_at", label: "Created" },
          ];
          setTable("seller-conversations-table", renderTable(payload.rows, columns));
        } catch (error) {
          setOutput("seller-conversations-output", error.message, true);
        }
      });

      bindForm("seller-post-conversation-form", async (formData) => {
        setOutput("seller-post-conversation-output", "Posting...");
        try {
          const payload = await fetchJson("/api/seller/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(Object.fromEntries(formData)),
          });
          setOutput("seller-post-conversation-output", \`Posted conversation_id \${payload.conversation_id} (t=\${formatMs(payload.durationMs)} ms)\`);
        } catch (error) {
          setOutput("seller-post-conversation-output", error.message, true);
        }
      });

      document.addEventListener("click", async (event) => {
        const button = event.target.closest("[data-action]");
        if (!button) return;

        const action = button.dataset.action;
        const id = button.dataset.id;
        const userId = byId("seller-user-id")?.value?.trim();
        if (!userId) {
          return alert("Provide User ID in the 'My offers' form first.");
        }

        const actionMap = {
          "cancel-offer": \`/api/seller/offers/\${id}/cancel\`,
          "transfer-offer": \`/api/seller/offers/\${id}/transfer\`,
        };

        const endpoint = actionMap[action];
        if (!endpoint) return;

        try {
          const payload = await fetchJson(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId }),
          });
          alert(\`Action completed (t=\${formatMs(payload.durationMs)} ms)\`);
        } catch (error) {
          alert(error.message);
        }
      });
    </script>
  </body>
</html>`);
});

app.get("/concurrency", (req, res) => {
  res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>DB Test UI - Concurrency</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <header class="page-header">
      <a class="muted" href="/">← Dashboard</a>
      <h1>Concurrency Tests</h1>
    </header>

    <main>
      <section class="control-panel">
        <div class="grid">
          <label>Concurrency multiplier
            <input id="concurrency" type="number" min="1" value="4" />
          </label>
          <label>Period (sec)
            <input id="period" type="number" min="1" value="9" />
          </label>
        </div>
        <div class="row">
          <button id="run-all" type="button">Run all</button>
        </div>
      </section>

      <section class="panel stack">
        <h2>Scenarios</h2>

        <div class="row">
          <button id="run-user-create" type="button">User creation</button>
          <div id="result-user-create" class="output"></div>
        </div>

        <div class="row">
          <button id="run-offer-register" type="button">Offer registering</button>
          <div id="result-offer-register" class="output"></div>
        </div>

        <div class="row">
          <button id="run-bid-cycle" type="button">Bid placing/cancelling (single item)</button>
          <label>Offer ID
            <input id="bid-cycle-offer-id" type="number" min="1" />
          </label>
          <div id="result-bid-cycle" class="output"></div>
        </div>

        <div class="row">
          <button id="run-selects" type="button">Intensive selects</button>
          <div id="result-selects" class="output"></div>
        </div>

        <div class="row">
          <button id="run-history" type="button">Item history search / verification</button>
          <div id="result-history" class="output"></div>
        </div>

        <div class="row">
          <button id="run-comments" type="button">Comment item offer (buyer + seller)</button>
          <label>Offer ID
            <input id="comment-offer-id" type="number" min="1" />
          </label>
          <label>Seller ID
            <input id="comment-seller-id" type="number" min="1" />
          </label>
          <label>Buyer ID
            <input id="comment-buyer-id" type="number" min="1" />
          </label>
          <div id="result-comments" class="output"></div>
        </div>
      </section>
    </main>

    <script>
      const byId = (id) => document.getElementById(id);
      const formatMs = (value) => (Number.isFinite(value) ? value.toFixed(2) : "-");
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

      const fetchJson = async (url, options = {}) => {
        const response = await fetch(url, options);
        const payload = await response.json();
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error || "Request failed");
        }
        return payload;
      };

      const getSettings = () => {
        const concurrency = Math.max(1, Number(byId("concurrency").value || 1));
        const periodSec = Math.max(1, Number(byId("period").value || 1));
        return {
          concurrency,
          periodMs: periodSec * 1000,
        };
      };

      const makeStats = () => ({
        count: 0,
        sum: 0,
        min: Number.POSITIVE_INFINITY,
        max: 0,
        errors: 0,
        lockErrors: 0,
        errorByMessage: {},
      });

      const record = (stats, value) => {
        if (!Number.isFinite(value)) return;
        stats.count += 1;
        stats.sum += value;
        stats.min = Math.min(stats.min, value);
        stats.max = Math.max(stats.max, value);
      };

      const isLockError = (error) => {
        const message = error?.message || String(error || "");
        return /deadlock detected|could not obtain lock|lock timeout|55P03|40P01|40001/i.test(message);
      };

      const recordError = (stats, error) => {
        const message = (error?.message || String(error || "unknown error")).trim();
        if (isLockError(error)) {
          stats.lockErrors += 1;
        } else {
          stats.errors += 1;
        }
        stats.errorByMessage[message] = (stats.errorByMessage[message] || 0) + 1;
      };

      const summarize = (stats) => {
        const topErrors = Object.entries(stats.errorByMessage)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([msg, cnt]) => \`\${cnt}x \${msg}\`)
          .join(" | ");

        if (stats.count === 0) {
          return \`No results. Errors: \${stats.errors}, lock_errors: \${stats.lockErrors}\${topErrors ? \`, top_errors: \${topErrors}\` : ""}\`;
        }
        const avg = stats.sum / stats.count;
        return \`avg=\${formatMs(avg)} ms, min=\${formatMs(stats.min)} ms, max=\${formatMs(stats.max)} ms, samples=\${stats.count}, errors=\${stats.errors}, lock_errors=\${stats.lockErrors}\${topErrors ? \`, top_errors: \${topErrors}\` : ""}\`;
      };

      const runConcurrent = async (task, concurrency, periodMs) => {
        const endTime = Date.now() + periodMs;

        const worker = async () => {
          while (Date.now() < endTime) {
            await task();
          }
        };

        const workers = Array.from({ length: concurrency }, () => worker());
        await Promise.all(workers);
      };

      let uniqueCounter = 0;
      const uniqueSuffix = () => \`\${Date.now()}-\${++uniqueCounter}\`;

      const createUser = async (prefix) => {
        const suffix = uniqueSuffix();
        const payload = {
          login: \`\${prefix}-\${suffix}\`,
          password: "pass123",
          name: prefix,
          surname: "User",
          email: \`\${prefix}-\${suffix}@example.com\`,
        };
        return fetchJson("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      };

      const createItem = async (creatorId, prefix) => {
        const suffix = uniqueSuffix();
        return fetchJson("/api/seller/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creator_id: creatorId,
            sn: \`SN-\${prefix}-\${suffix}\`,
            title: \`Item \${prefix} \${suffix}\`,
          }),
        });
      };

      const registerOffer = async (creatorId, itemId, price) => {
        return fetchJson("/api/seller/offers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creator_id: creatorId,
            item_id: itemId,
            price,
            description: "Load test offer",
          }),
        });
      };

      const placeBid = async (bidderId, offerId, value) => {
        return fetchJson("/api/buyer/bids", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bidder_id: bidderId,
            offer_id: offerId,
            value,
          }),
        });
      };

      const cancelBid = async (bidId, bidderId) => {
        return fetchJson(\`/api/buyer/bids/\${bidId}/cancel\`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: bidderId }),
        });
      };

      const postBuyerConversation = async (commenterId, offerId, contents) => {
        return fetchJson("/api/buyer/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commenter_id: commenterId,
            offer_id: offerId,
            subject: "load-test-buyer",
            contents,
          }),
        });
      };

      const postSellerConversation = async (commenterId, offerId, contents) => {
        return fetchJson("/api/seller/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commenter_id: commenterId,
            offer_id: offerId,
            subject: "load-test-seller",
            contents,
          }),
        });
      };

      const setButtonState = (buttonId, label, disabled) => {
        const btn = byId(buttonId);
        if (!btn) return;
        btn.textContent = label;
        btn.disabled = disabled;
      };

      const setResult = (resultId, text, isError = false) => {
        const el = byId(resultId);
        if (!el) return;
        el.textContent = text;
        el.classList.toggle("error", isError);
      };

      const runScenario = async ({ name, buttonId, resultId, setup, task }) => {
        const { concurrency, periodMs } = getSettings();
        const stats = makeStats();

        setButtonState(buttonId, "Testing...", true);
        setResult(resultId, \`Running \${name}...\`);

        let context = null;
        try {
          if (setup) {
            context = await setup(stats);
          }

          await runConcurrent(async () => {
            try {
              await task(stats, context);
            } catch (error) {
              recordError(stats, error);
            }
          }, concurrency, periodMs);

          setResult(resultId, summarize(stats));
        } catch (error) {
          setResult(resultId, error.message || String(error), true);
        } finally {
          setButtonState(buttonId, name, false);
        }
      };

      const scenarios = {
        userCreate: {
          name: "User creation",
          buttonId: "run-user-create",
          resultId: "result-user-create",
          task: async (stats) => {
            const payload = await createUser("buyer");
            record(stats, payload.durationMs);
          },
        },
        offerRegister: {
          name: "Offer registering",
          buttonId: "run-offer-register",
          resultId: "result-offer-register",
          task: async (stats) => {
            const seller = await createUser("seller");
            record(stats, seller.durationMs);
            const item = await createItem(seller.user_id, "offer");
            record(stats, item.durationMs);
            const offer = await registerOffer(seller.user_id, item.item_id, 100);
            record(stats, offer.durationMs);
          },
        },
        bidCycle: {
          name: "Bid placing/cancelling (single item)",
          buttonId: "run-bid-cycle",
          resultId: "result-bid-cycle",
          setup: async () => {
            const offerId = byId("bid-cycle-offer-id")?.value?.trim();
            if (!offerId) {
              throw new Error("Offer ID is required for bid cycle.");
            }
            return { offerId };
          },
          task: async (stats, context) => {
            const buyer = await createUser("buyer");
            record(stats, buyer.durationMs);
            const bid = await placeBid(buyer.user_id, context.offerId, 130);
            record(stats, bid.durationMs);
            const cancel = await cancelBid(bid.bid_id, buyer.user_id);
            record(stats, cancel.durationMs);
          },
        },
        intensiveSelects: {
          name: "Intensive selects",
          buttonId: "run-selects",
          resultId: "result-selects",
          task: async (stats) => {
            const users = await fetchJson("/api/users");
            record(stats, users.durationMs);
            const items = await fetchJson("/api/items");
            record(stats, items.durationMs);
            const offers = await fetchJson("/api/offers");
            record(stats, offers.durationMs);
            const bids = await fetchJson("/api/bids");
            record(stats, bids.durationMs);
          },
        },
        historyVerify: {
          name: "Item history search / verification",
          buttonId: "run-history",
          resultId: "result-history",
          setup: async (stats) => {
            const seller = await createUser("seller");
            record(stats, seller.durationMs);
            const item = await createItem(seller.user_id, "history");
            record(stats, item.durationMs);
            return { itemId: item.item_id };
          },
          task: async (stats, context) => {
            const history = await fetchJson(\`/api/items/\${context.itemId}/history\`);
            record(stats, history.durationMs);
            const verify = await fetchJson(\`/api/items/\${context.itemId}/verify\`);
            record(stats, verify.durationMs);
          },
        },
        commentsBothSides: {
          name: "Comment item offer (buyer + seller)",
          buttonId: "run-comments",
          resultId: "result-comments",
          setup: async () => {
            const offerId = byId("comment-offer-id")?.value?.trim();
            const sellerId = byId("comment-seller-id")?.value?.trim();
            const buyerId = byId("comment-buyer-id")?.value?.trim();
            if (!offerId || !sellerId || !buyerId) {
              throw new Error("Offer ID, Seller ID, Buyer ID required.");
            }
            return { offerId, sellerId, buyerId };
          },
          task: async (stats, context) => {
            const buyerComment = await postBuyerConversation(
              context.buyerId,
              context.offerId,
              "buyer side load test message"
            );
            record(stats, buyerComment.durationMs);

            const sellerComment = await postSellerConversation(
              context.sellerId,
              context.offerId,
              "seller side load test message"
            );
            record(stats, sellerComment.durationMs);
          },
        },
      };

      byId("run-user-create").addEventListener("click", () => runScenario(scenarios.userCreate));
      byId("run-offer-register").addEventListener("click", () => runScenario(scenarios.offerRegister));
      byId("run-bid-cycle").addEventListener("click", () => runScenario(scenarios.bidCycle));
      byId("run-selects").addEventListener("click", () => runScenario(scenarios.intensiveSelects));
      byId("run-history").addEventListener("click", () => runScenario(scenarios.historyVerify));
      byId("run-comments").addEventListener("click", () => runScenario(scenarios.commentsBothSides));

      byId("run-all").addEventListener("click", async () => {
        await Promise.all([
          runScenario(scenarios.userCreate),
          runScenario(scenarios.offerRegister),
          runScenario(scenarios.bidCycle),
          runScenario(scenarios.intensiveSelects),
          runScenario(scenarios.historyVerify),
          runScenario(scenarios.commentsBothSides),
        ]);
      });
    </script>
  </body>
</html>`);
});

app.use("/api", basicRoutes);
app.use("/api/buyer", buyerRoutes);
app.use("/api/seller", sellerRoutes);

const port = process.env.PORT || 80;

app.listen(port, () => {
  console.log(`Test UI listening on port ${port}`);
});
