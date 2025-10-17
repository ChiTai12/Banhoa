(function () {
  document.addEventListener("DOMContentLoaded", function () {
  // Cart badge suppression is handled by templates and cart update functions.
  // Previous aggressive runtime removal and observer logic removed to
  // avoid unexpected side effects and keep behavior deterministic.

    let currentOverlay = null;
    // backups for host functions we'll temporarily silence while modal is open
    let _oldSimpleCartUpdate = null;
    let _oldShowAddNotification = null;

    function buildProductUrl(params) {
      try {
        const url = new URL("product-detail.html", window.location.href);
        Object.keys(params || {}).forEach((k) => {
          if (params[k] != null) url.searchParams.set(k, params[k]);
        });
        return url.toString();
      } catch (e) {
        // fallback: build query string manually
        const q = Object.keys(params || {})
          .map(
            (k) => encodeURIComponent(k) + "=" + encodeURIComponent(params[k])
          )
          .join("&");
        return "product-detail.html" + (q ? "?" + q : "");
      }
    }
    function importFetchedStyles(doc, src) {
      return new Promise(function (resolve) {
        try {
          var baseHref = null;
          try {
            const u = new URL(src, window.location.href);
            u.hash = "";
            u.search = "";
            u.pathname = u.pathname.replace(/[^/]*$/, "");
            baseHref = u.toString();
          } catch (e) {}

          // add temporary base so relative hrefs resolve
          if (
            baseHref &&
            !document.querySelector("base[data-banhoa-product-base]")
          ) {
            try {
              const b = document.createElement("base");
              b.setAttribute("href", baseHref);
              b.setAttribute("data-banhoa-product-base", "1");
              document.head.insertBefore(b, document.head.firstChild || null);
            } catch (e) {}
          }

          const nodes = Array.from(
            doc.querySelectorAll('link[rel="stylesheet"], style')
          );
          if (!nodes.length) return resolve();
          var remaining = nodes.length;
          function oneDone() {
            remaining--;
            if (remaining <= 0) resolve();
          }

          nodes.forEach(function (n) {
            try {
              if (n.tagName && n.tagName.toLowerCase() === "link") {
                const href = n.getAttribute("href");
                if (!href) return oneDone();
                var resolved = href;
                try {
                  resolved = new URL(href, baseHref || src).toString();
                } catch (e) {}
                // avoid duplicating an identical href
                if (document.querySelector('link[href="' + resolved + '"]'))
                  return oneDone();
                const l = document.createElement("link");
                l.rel = "stylesheet";
                l.href = resolved;
                l.setAttribute("data-banhoa-import", "1");
                var media = n.getAttribute && n.getAttribute("media");
                if (media) l.setAttribute("media", media);
                l.onload = oneDone;
                l.onerror = oneDone;
                document.head.appendChild(l);
              } else if (n.tagName && n.tagName.toLowerCase() === "style") {
                const s = document.createElement("style");
                s.setAttribute("data-banhoa-import", "1");
                s.textContent = n.textContent || "";
                document.head.appendChild(s);
                oneDone();
              } else oneDone();
            } catch (e) {
              oneDone();
            }
          });
        } catch (e) {
          resolve();
        }
      });
    }

    function closeProductModal() {
      if (!currentOverlay) return;
      try {
        document.body.removeChild(currentOverlay);
      } catch (e) {}
      currentOverlay = null;
      window.removeEventListener("keydown", onKeyDown);
      // restore focus
      try {
        document.activeElement && document.activeElement.focus();
      } catch (e) {}
      // remove contact-buttons scoped style injected for modal
      try {
        const _s = document.querySelector("style[data-banhoa-contact-css]");
        if (_s && _s.parentNode) _s.parentNode.removeChild(_s);
      } catch (e) {}
      // remove any imported styles/links and temporary base
      try {
        document
          .querySelectorAll("[data-banhoa-import], [data-banhoa-modal-import]")
          .forEach(function (n) {
            try {
              n.parentNode && n.parentNode.removeChild(n);
            } catch (e) {}
          });
        // remove any imported scripts from fetched document
        try {
          document
            .querySelectorAll("[data-banhoa-import-script]")
            .forEach(function (s) {
              try {
                s.parentNode && s.parentNode.removeChild(s);
              } catch (e) {}
            });
        } catch (e) {}
        var _b = document.querySelector("base[data-banhoa-product-base]");
        if (_b)
          try {
            _b.parentNode && _b.parentNode.removeChild(_b);
          } catch (e) {}
      } catch (e) {}
      // restore any silenced host functions
      try {
        if (
          _oldSimpleCartUpdate &&
          window.simpleCartManager &&
          typeof window.simpleCartManager.updateCartCount === "function"
        ) {
          try {
            window.simpleCartManager.updateCartCount = _oldSimpleCartUpdate;
          } catch (e) {}
        }
      } catch (e) {}
      try {
        if (
          _oldShowAddNotification &&
          typeof window.showAddToCartNotification === "function"
        ) {
          try {
            window.showAddToCartNotification = _oldShowAddNotification;
          } catch (e) {}
        }
      } catch (e) {}
      // restore cart-count visibility
      try {
        const cartCountEl = document.getElementById("cart-count");
        if (cartCountEl && cartCountEl.hasAttribute("data-banhoa-modal-hide")) {
          try {
            cartCountEl.removeAttribute("data-banhoa-modal-hide");
          } catch (e) {}
        }
        const sh = document.querySelector("style[data-banhoa-cart-hide]");
        if (sh && sh.parentNode) sh.parentNode.removeChild(sh);
      } catch (e) {}
    }

    function onKeyDown(ev) {
      if (ev.key === "Escape") closeProductModal();
    }

    function openProductDetailModal(params) {
      closeProductModal();
      const src = buildProductUrl(params || {});

      // Try fetch & inject product-detail.html (so modal looks exactly like standalone)
      // If that fails, we fallback to the iframe approach.
      fetch(src, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error("fetch failed");
          return r.text();
        })
        .then((htmlText) => {
          try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, "text/html");
            // Copy toàn bộ <link rel="stylesheet">, <link rel="preconnect">, <link href*="fonts"], <style> từ product-detail.html vào <head>
            const headEls = doc.head.querySelectorAll(
              'link[rel="stylesheet"], link[rel="preconnect"], link[href*="fonts"], style'
            );
            headEls.forEach((el) => {
              // Tránh trùng lặp nếu đã có trong head
              if (
                el.tagName === "LINK" &&
                document.head.querySelector(`link[href="${el.href}"]`)
              )
                return;
              const clone = el.cloneNode(true);
              clone.setAttribute("data-banhoa-modal-import", "1");
              document.head.appendChild(clone);
            });
            // Ensure product-detail.css is present on the host page
            if (!document.querySelector('link[href="product-detail.css"]')) {
              const l = document.createElement("link");
              l.rel = "stylesheet";
              l.href = "product-detail.css";
              document.head.appendChild(l);
            }

            // Prefer extracting the inner .modal-container from the fetched doc.
            // Do NOT insert the fetched .modal-overlay element itself because it
            // would cover the host page; create our own lightweight overlay
            // wrapper (`rootOverlay`) and inject only the container content.
            const rootOverlay = document.createElement("div");
            rootOverlay.className = "banhoa-product-overlay";
            Object.assign(rootOverlay.style, {
              position: "fixed",
              inset: "0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.36)",
              zIndex: "2000",
              padding: "20px",
              boxSizing: "border-box",
            });

            // Always prefer .modal-container from the fetched document. Do not
            // use the outer .modal-overlay element even if present.
            let modalInner =
              doc.querySelector(".modal-container") ||
              doc.querySelector(".container") ||
              doc.body;

            // Clone nodes to import into current document
            let cloned = modalInner.cloneNode(true);
            // If the cloned node (or its descendants) still contains a
            // .modal-overlay wrapper (some pages nest oddly), remove it so we
            // don't accidentally insert a full-viewport overlay from the
            // fetched document.
            try {
              if (
                cloned.classList &&
                cloned.classList.contains("modal-overlay")
              ) {
                const inside =
                  cloned.querySelector(".modal-container") ||
                  cloned.querySelector(".container");
                if (inside) cloned = inside.cloneNode(true);
              }
              // remove any remaining overlay elements inside cloned
              const overlays = Array.from(
                cloned.querySelectorAll &&
                  cloned.querySelectorAll(".modal-overlay")
              );
              overlays.forEach(function (o) {
                try {
                  // replace overlay with its children
                  while (o.firstChild)
                    o.parentNode.insertBefore(o.firstChild, o);
                  o.parentNode.removeChild(o);
                } catch (e) {}
              });
            } catch (e) {}
            // Adjust close button to call closeProductModal
            const closeBtn = cloned.querySelector(".close-btn");
            if (closeBtn) {
              closeBtn.removeAttribute("onclick");
              closeBtn.addEventListener("click", function (ev) {
                ev.preventDefault && ev.preventDefault();
                closeProductModal();
              });
            }

            // Import styles from fetched doc first, then insert cloned modal
            importFetchedStyles(doc, src).then(function () {
              try {
                // Insert a scoped reset to prevent host styles (like
                // text-transform: uppercase) from leaking into the injected
                // modal. This style is marked so it will be removed on close.
                try {
                  const reset = document.createElement("style");
                  reset.setAttribute("data-banhoa-import", "1");
                  reset.textContent =
                    "\n.banhoa-product-overlay .modal-container,\n.banhoa-product-overlay .modal-container * {\n  text-transform: none !important;\n}\n";
                  document.head.appendChild(reset);
                } catch (e) {}
                rootOverlay.appendChild(cloned);
                document.body.appendChild(rootOverlay);
                currentOverlay = rootOverlay;

                // Hide host cart-count badge while modal is open so fetched
                // product-detail can control UX without the host showing a
                // duplicate badge. This uses a short-lived style marked for
                // cleanup on close.
                try {
                  const cartCountEl = document.getElementById("cart-count");
                  if (cartCountEl) {
                    cartCountEl.setAttribute("data-banhoa-modal-hide", "1");
                    if (
                      !document.querySelector("style[data-banhoa-cart-hide]")
                    ) {
                      const sh = document.createElement("style");
                      sh.setAttribute("data-banhoa-cart-hide", "1");
                      // hide only the numeric text, keep the circular badge/icon visible
                      sh.textContent = `#cart-count[data-banhoa-modal-hide]{ color: transparent !important; font-size: 0 !important; line-height: 0 !important; }`;
                      document.head.appendChild(sh);
                    }
                  }
                } catch (e) {}

                // Temporarily silence host cart UI updates/notifications so the
                // fetched page (product-detail) can manage them without the
                // host duplicating or showing alternate feedback. Originals are
                // restored in closeProductModal(). This avoids visual chaos
                // like duplicate notifications or unexpected badge updates.
                try {
                  // silence simpleCartManager.updateCartCount if present
                  if (
                    window.simpleCartManager &&
                    typeof window.simpleCartManager.updateCartCount ===
                      "function"
                  ) {
                    _oldSimpleCartUpdate =
                      window.simpleCartManager.updateCartCount;
                    try {
                      window.simpleCartManager.updateCartCount = function () {};
                    } catch (e) {}
                  }
                  // silence page-level notification helper if defined
                  if (typeof window.showAddToCartNotification === "function") {
                    _oldShowAddNotification = window.showAddToCartNotification;
                    try {
                      window.showAddToCartNotification = function () {};
                    } catch (e) {}
                  }
                } catch (e) {}

                // Import and execute scripts from fetched document so inline
                // initialization runs as expected. Mark imported scripts for
                // cleanup with data-banhoa-import-script.
                try {
                  const scripts = Array.from(doc.querySelectorAll("script"));
                  scripts.forEach(function (s) {
                    try {
                      if (s.src) {
                        var resolved = s.src;
                        try {
                          resolved = new URL(s.src, src).toString();
                        } catch (e) {}
                        // avoid duplicating an identical src
                        if (
                          document.querySelector(
                            'script[src="' + resolved + '"]'
                          )
                        )
                          return;
                        const sc = document.createElement("script");
                        sc.src = resolved;
                        sc.async = false;
                        sc.setAttribute("data-banhoa-import-script", "1");
                        document.body.appendChild(sc);
                      } else {
                        // inline script: execute by inserting a new script node
                        const sc = document.createElement("script");
                        sc.setAttribute("data-banhoa-import-script", "1");
                        sc.textContent = s.textContent || "";
                        document.body.appendChild(sc);
                      }
                    } catch (e) {}
                  });
                } catch (e) {}
                // Some scripts in product-detail.html register DOMContentLoaded
                // handlers which won't fire when injected after load. Call
                // known init functions if present so the modal initializes
                // correctly.
                try {
                  // prefer local functions; many are declared globally in
                  // product-detail.html when executed.
                  if (typeof getProductFromURL === "function") {
                    try {
                      getProductFromURL();
                    } catch (e) {}
                  }
                  if (
                    typeof updateProductDescription === "function" &&
                    params &&
                    params.name
                  ) {
                    try {
                      updateProductDescription(params.name);
                    } catch (e) {}
                  }

                  // sync quantity display if function exists
                  try {
                    const qEl =
                      cloned.querySelector("#quantity") ||
                      cloned.querySelector(".quantity-display");
                    if (
                      qEl &&
                      typeof window.getProductQuantity === "function"
                    ) {
                      try {
                        const q = window.getProductQuantity();
                        qEl.textContent = q;
                      } catch (e) {}
                    }
                  } catch (e) {}
                } catch (e) {}

                // If this modal was opened with explicit params (name/price/image),
                // re-apply them AFTER product-detail scripts run. Many product
                // scripts read window.location and may initialize a default
                // product; forcing DOM values here ensures the injected modal
                // shows the product the user clicked.
                try {
                  if (params && params.name) {
                    try {
                      const title = cloned.querySelector("#productTitle");
                      if (title) title.textContent = params.name;
                    } catch (e) {}
                    try {
                      const p = cloned.querySelector("#productPrice");
                      if (p && params.price) p.textContent = params.price;
                    } catch (e) {}
                    try {
                      const img = cloned.querySelector("#productImage");
                      if (img && params.image) img.src = params.image;
                    } catch (e) {}

                    // Show matching detailed block inside cloned modal
                    try {
                      const detailItems = cloned.querySelectorAll(".detail-item");
                      if (detailItems && detailItems.length) {
                        detailItems.forEach((it) => {
                          try {
                            if (
                              it.dataset &&
                              it.dataset.name &&
                              it.dataset.name.trim() === params.name.trim()
                            ) {
                              it.style.display = "";
                            } else {
                              it.style.display = "none";
                            }
                          } catch (e) {}
                        });
                      }
                    } catch (e) {}
                  }
                } catch (e) {}
              } catch (e) {}
            });

            // Populate product fields from params (name, price, image)
            try {
              if (params && params.name) {
                const title = cloned.querySelector("#productTitle");
                if (title) title.textContent = params.name;
              }
              if (params && params.price) {
                const p = cloned.querySelector("#productPrice");
                if (p) p.textContent = params.price;
              }
              if (params && params.image) {
                const img = cloned.querySelector("#productImage");
                if (img) img.src = params.image;
              }

              // Show matching detailed block
              if (params && params.name) {
                const detailItems = cloned.querySelectorAll(".detail-item");
                if (detailItems && detailItems.length) {
                  detailItems.forEach((it) => {
                    if (
                      it.dataset &&
                      it.dataset.name &&
                      it.dataset.name.trim() === params.name.trim()
                    ) {
                      it.style.display = "";
                    } else {
                      it.style.display = "none";
                    }
                  });
                }
              }
            } catch (e) {}

            // Quantity and order logic is intentionally NOT attached here.
            // The standalone `product-detail.html` scripts provide the
            // correct handlers (inline onclick or script-initialized).
            // Attaching duplicate listeners from the host caused multiple
            // invocations (e.g. 20 -> 17) so we rely on the fetched page's
            // own logic. If needed, product-detail functions are invoked
            // above (getProductFromURL / updateProductDescription) and the
            // quantity display is synced where possible.

            // close when clicking backdrop
            rootOverlay.addEventListener("click", function (ev) {
              if (ev.target === rootOverlay) closeProductModal();
            });

            // ESC handler
            window.addEventListener("keydown", onKeyDown);
            return;
          } catch (e) {
            // fallthrough to iframe fallback
          }
        })
        .catch(function () {
          // fallback to iframe approach if fetch or injection fails
        });

      // Fallback iframe path (if fetch/inject didn't return earlier)
      // const overlay = document.createElement("div");
      // overlay.className = "banhoa-product-overlay";
      // Object.assign(overlay.style, {
      //   position: "fixed",
      //   inset: "0",
      //   display: "flex",
      //   alignItems: "center",
      //   justifyContent: "center",
      //   background: "rgba(0,0,0,0.36)",
      //   zIndex: "2000",
      //   padding: "20px",
      //   boxSizing: "border-box",
      // });

      const modal = document.createElement("div");
      modal.className = "banhoa-product-modal";
      Object.assign(modal.style, {
        width: "95%",
        maxWidth: "1100px",
        maxHeight: "90vh",
        borderRadius: "10px",
        overflow: "hidden",
        boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
        background: "#fff",
        position: "relative",
        display: "block",
      });

      const iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.border = "0";
      iframe.title = params && params.name ? params.name : "Product Detail";
      // Attach load handler so we can inspect child DOM. If the child page
      // already renders its own .modal-overlay, insert the iframe as a
      // full-viewport fixed element so the child appearance matches the
      // standalone product-detail.html. Otherwise use our parent modal.
      iframe.addEventListener("load", function () {
        try {
          const idoc = iframe.contentDocument || iframe.contentWindow.document;
          if (
            idoc &&
            idoc.querySelector &&
            idoc.querySelector(".modal-overlay")
          ) {
            // remove our parent modal and replace with full-viewport iframe
            try {
              document.body.removeChild(overlay);
            } catch (e) {}
            Object.assign(iframe.style, {
              position: "fixed",
              inset: "0",
              width: "100%",
              height: "100%",
              zIndex: "2000",
              background: "transparent",
            });
            document.body.appendChild(iframe);
            currentOverlay = iframe;

            // allow the child to request the parent to close the iframe
            window.addEventListener("message", function onmsg(ev) {
              try {
                if (!ev.data) return;
                if (ev.data && ev.data.type === "banhoa:close-modal") {
                  window.removeEventListener("message", onmsg);
                  closeProductModal();
                }
              } catch (e) {}
            });
          } else {
            // child doesn't provide its own overlay - keep our parent modal
            modal.appendChild(iframe);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            currentOverlay = overlay;
            window.addEventListener("keydown", onKeyDown);
          }
        } catch (e) {
          // on any error, fall back to parent modal insertion
          try {
            modal.appendChild(iframe);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            currentOverlay = overlay;
            window.addEventListener("keydown", onKeyDown);
          } catch (err) {}
        }
      });

      // add a close button for parent-modal mode; if child provides its
      // own close control it will be used instead when we switch to full iframe.
      // const closeBtn = document.createElement("button");
      // closeBtn.type = "button";
      // closeBtn.setAttribute("aria-label", "Close product");
      // closeBtn.innerHTML = "&times;";
      // Object.assign(closeBtn.style, {
      //   position: "absolute",
      //   right: "12px",
      //   top: "12px",
      //   zIndex: "2100",
      //   width: "40px",
      //   height: "40px",
      //   borderRadius: "50%",
      //   border: "none",
      //   background: "#ff9500",
      //   color: "#fff",
      //   cursor: "pointer",
      //   fontSize: "22px",
      //   lineHeight: "1",
      // });
      // closeBtn.addEventListener("click", closeProductModal);

      // modal.appendChild(closeBtn);

      // initially append overlay now; load handler may replace it with raw iframe
      document.body.appendChild(overlay);
    }

    // Intercept clicks for anchors/buttons that target product-detail
    document.addEventListener("click", function (ev) {
      try {
        const el = ev.target.closest && ev.target.closest("a, button");
        if (!el) return;

        const href = el.getAttribute && el.getAttribute("href");
        let isProductLink = false;
        if (href) {
          try {
            const u = new URL(href, window.location.href);
            const p = (u.pathname || "").toLowerCase();
            isProductLink =
              p.endsWith("product-detail.html") ||
              p.endsWith("/product-detail.html");
          } catch (e) {
            isProductLink =
              href.toLowerCase().indexOf("product-detail.html") !== -1;
          }
        }

        const hasData =
          el.dataset &&
          (el.dataset.productName ||
            el.dataset.productImage ||
            el.dataset.productPrice);
        if (!isProductLink && !hasData) return;

        // if it's an actual anchor, prevent navigation
        if (el.tagName && el.tagName.toLowerCase() === "a") ev.preventDefault();

        const params = {};
        if (href) {
          try {
            const url = new URL(href, window.location.href);
            url.searchParams.forEach((v, k) => (params[k] = v));
          } catch (e) {}
        }
        if (el.dataset) {
          if (el.dataset.productName) params.name = el.dataset.productName;
          if (el.dataset.productPrice) params.price = el.dataset.productPrice;
          if (el.dataset.productImage) params.image = el.dataset.productImage;
        }

        openProductDetailModal(params);
      } catch (e) {
        // swallow errors to avoid breaking other scripts
        console.error("product-modal error", e);
      }
    });

    // Listen for close requests from iframe content (product-detail page)
    window.addEventListener("message", function (ev) {
      try {
        if (!ev.data) return;
        if (ev.data && ev.data.type === "banhoa:close-modal")
          closeProductModal();
      } catch (e) {}
    });

    // expose helper for inline usage
    try {
      // expose two helpers: one compatible with inline calls, and a
      // explicit modal opener other scripts can call.
      window.goToProductDetail = function (name, price, image) {
        openProductDetailModal({ name: name, price: price, image: image });
      };
      window.openProductDetailModal = function (params) {
        openProductDetailModal(params);
      };
    } catch (e) {}
  });
})();
