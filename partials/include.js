(function () {
  document.addEventListener("DOMContentLoaded", function () {
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
        var baseHref = null;
        try {
          const u = new URL(src, window.location.href);
          u.hash = "";
          u.search = "";
          u.pathname = u.pathname.replace(/[^/]*$/, "");
          baseHref = u.toString();
        } catch (e) {
          baseHref = null;
        }

        // add temporary base so relative hrefs resolve
        if (
          baseHref &&
          !document.querySelector("base[data-banhoa-product-base]")
        ) {
          const b = document.createElement("base");
          b.setAttribute("href", baseHref);
          b.setAttribute("data-banhoa-product-base", "1");
          document.head.insertBefore(b, document.head.firstChild || null);
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
          if (n.tagName && n.tagName.toLowerCase() === "link") {
            const href = n.getAttribute("href");
            if (!href) return oneDone();
            var resolved = href;
            try {
              resolved = new URL(href, baseHref || src).toString();
            } catch (e) {
              resolved = href;
            }
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
        });
      });
    }

    function closeProductModal() {
      if (!currentOverlay) return;
      if (currentOverlay.parentNode) document.body.removeChild(currentOverlay);
      currentOverlay = null;
      window.removeEventListener("keydown", onKeyDown);

      if (
        document.activeElement &&
        typeof document.activeElement.focus === "function"
      ) {
        document.activeElement.focus();
      }

      const contactStyle = document.querySelector(
        "style[data-banhoa-contact-css]"
      );
      if (contactStyle && contactStyle.parentNode)
        contactStyle.parentNode.removeChild(contactStyle);

      // remove any imported styles/links and temporary base
      document
        .querySelectorAll("[data-banhoa-import], [data-banhoa-modal-import]")
        .forEach(function (n) {
          if (n.parentNode) n.parentNode.removeChild(n);
        });
      document
        .querySelectorAll("[data-banhoa-import-script]")
        .forEach(function (s) {
          if (s.parentNode) s.parentNode.removeChild(s);
        });
      var _b = document.querySelector("base[data-banhoa-product-base]");
      if (_b && _b.parentNode) _b.parentNode.removeChild(_b);

      // restore any silenced host functions
      if (
        _oldSimpleCartUpdate &&
        window.simpleCartManager &&
        typeof window.simpleCartManager.updateCartCount === "function"
      ) {
        window.simpleCartManager.updateCartCount = _oldSimpleCartUpdate;
      }
      if (
        _oldShowAddNotification &&
        typeof window.showAddToCartNotification === "function"
      ) {
        window.showAddToCartNotification = _oldShowAddNotification;
      }

      // restore cart-count visibility
      const cartCountEl = document.getElementById("cart-count");
      if (cartCountEl && cartCountEl.hasAttribute("data-banhoa-modal-hide")) {
        cartCountEl.removeAttribute("data-banhoa-modal-hide");
      }
      const sh = document.querySelector("style[data-banhoa-cart-hide]");
      if (sh && sh.parentNode) sh.parentNode.removeChild(sh);
    }

    function onKeyDown(ev) {
      if (ev.key === "Escape") closeProductModal();
    }

    function openProductDetailModal(params) {
      closeProductModal();
      const src = buildProductUrl(params || {});

      // Try fetch & inject product-detail.html (so modal looks exactly like standalone)
      fetch(src, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error("fetch failed");
          return r.text();
        })
        .then((htmlText) => {
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlText, "text/html");

          // Copy selected head elements from fetched doc into host head
          const headEls = doc.head.querySelectorAll(
            'link[rel="stylesheet"], link[rel="preconnect"], link[href*="fonts"], style'
          );
          headEls.forEach((el) => {
            if (
              el.tagName === "LINK" &&
              document.head.querySelector(`link[href="${el.href}"]`)
            )
              return;
            const clone = el.cloneNode(true);
            clone.setAttribute("data-banhoa-modal-import", "1");
            document.head.appendChild(clone);
          });

          if (!document.querySelector('link[href="product-detail.css"]')) {
            const l = document.createElement("link");
            l.rel = "stylesheet";
            l.href = "product-detail.css";
            document.head.appendChild(l);
          }

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

          let modalInner =
            doc.querySelector(".modal-container") ||
            doc.querySelector(".container") ||
            doc.body;
          let cloned = modalInner.cloneNode(true);

          if (cloned.classList && cloned.classList.contains("modal-overlay")) {
            const inside =
              cloned.querySelector(".modal-container") ||
              cloned.querySelector(".container");
            if (inside) cloned = inside.cloneNode(true);
          }

          // remove any remaining overlay elements inside cloned
          const overlays = cloned.querySelectorAll
            ? Array.from(cloned.querySelectorAll(".modal-overlay"))
            : [];
          overlays.forEach(function (o) {
            while (o.firstChild) o.parentNode.insertBefore(o.firstChild, o);
            o.parentNode.removeChild(o);
          });

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
            const reset = document.createElement("style");
            reset.setAttribute("data-banhoa-import", "1");
            reset.textContent =
              "\n.banhoa-product-overlay .modal-container,\n.banhoa-product-overlay .modal-container * {\n  text-transform: none !important;\n}\n";
            document.head.appendChild(reset);

            rootOverlay.appendChild(cloned);
            document.body.appendChild(rootOverlay);
            currentOverlay = rootOverlay;

            const cartCountEl = document.getElementById("cart-count");
            if (cartCountEl) {
              cartCountEl.setAttribute("data-banhoa-modal-hide", "1");
              if (!document.querySelector("style[data-banhoa-cart-hide]")) {
                const sh = document.createElement("style");
                sh.setAttribute("data-banhoa-cart-hide", "1");
                sh.textContent = `#cart-count[data-banhoa-modal-hide]{ color: transparent !important; font-size: 0 !important; line-height: 0 !important; }`;
                document.head.appendChild(sh);
              }
            }

            // silence simpleCartManager.updateCartCount if present
            if (
              window.simpleCartManager &&
              typeof window.simpleCartManager.updateCartCount === "function"
            ) {
              _oldSimpleCartUpdate = window.simpleCartManager.updateCartCount;
              window.simpleCartManager.updateCartCount = function () {};
            }
            if (typeof window.showAddToCartNotification === "function") {
              _oldShowAddNotification = window.showAddToCartNotification;
              window.showAddToCartNotification = function () {};
            }

            // import scripts from fetched doc
            const scripts = Array.from(doc.querySelectorAll("script"));
            scripts.forEach(function (s) {
              if (s.src) {
                var resolved = s.src;
                try {
                  resolved = new URL(s.src, src).toString();
                } catch (e) {
                  resolved = s.src;
                }
                if (document.querySelector('script[src="' + resolved + '"]'))
                  return;
                const sc = document.createElement("script");
                sc.src = resolved;
                sc.async = false;
                sc.setAttribute("data-banhoa-import-script", "1");
                document.body.appendChild(sc);
              } else {
                const sc = document.createElement("script");
                sc.setAttribute("data-banhoa-import-script", "1");
                sc.textContent = s.textContent || "";
                document.body.appendChild(sc);
              }
            });

            // call known initialization helpers if available
            if (typeof getProductFromURL === "function") getProductFromURL();
            if (
              typeof updateProductDescription === "function" &&
              params &&
              params.name
            )
              updateProductDescription(params.name);

            // sync quantity display if function exists
            const qEl =
              cloned.querySelector("#quantity") ||
              cloned.querySelector(".quantity-display");
            if (qEl && typeof window.getProductQuantity === "function") {
              const q = window.getProductQuantity();
              qEl.textContent = q;
            }

            // Populate product fields from params (name, price, image)
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

            // Show matching detailed block inside cloned modal
            const detailItems = cloned.querySelectorAll(".detail-item");
            if (detailItems && detailItems.length) {
              detailItems.forEach((it) => {
                if (
                  it.dataset &&
                  it.dataset.name &&
                  params &&
                  params.name &&
                  it.dataset.name.trim() === params.name.trim()
                ) {
                  it.style.display = "";
                } else {
                  it.style.display = "none";
                }
              });
            }

            // close when clicking backdrop
            rootOverlay.addEventListener("click", function (ev) {
              if (ev.target === rootOverlay) closeProductModal();
            });

            // ESC handler
            window.addEventListener("keydown", onKeyDown);
          });
        })
        .catch(function (err) {
          // fetching or injection failed; open product-detail in new tab as fallback
          console.warn(
            "Could not inject product detail, opening standalone:",
            err
          );
          window.open(src, "_blank");
        });

      // note: we intentionally avoid the complex iframe fallback here — the fetch+inject approach is preferred
    }

    // Intercept clicks for anchors/buttons that target product-detail
    document.addEventListener("click", function (ev) {
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

      try {
        openProductDetailModal(params);
      } catch (e) {
        console.error("product-modal open failed", e);
      }
    });

    // Listen for close requests from iframe content (product-detail page)
    window.addEventListener("message", function (ev) {
      if (!ev.data) return;
      if (ev.data && ev.data.type === "banhoa:close-modal") closeProductModal();
    });

    // expose helper for inline usage
    // expose two helpers: one compatible with inline calls, and an explicit modal opener other scripts can call.
    window.goToProductDetail = function (name, price, image) {
      openProductDetailModal({ name: name, price: price, image: image });
    };
    window.openProductDetailModal = function (params) {
      openProductDetailModal(params);
    };
  });
})();
