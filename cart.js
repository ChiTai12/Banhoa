// Cart management system
class CartManager {
  constructor() {
    this.cart = this.loadCart();
    this.shippingFee = 30000; // 30,000 VND
    this.updateCartCount();
  }

  // Load cart from localStorage
  loadCart() {
    // Cart is per-user: key = floralShopCart_<username>
    const user = JSON.parse(localStorage.getItem("floralShopUser") || "null");
    if (!user || !user.username) {
      return [];
    }
    const key = `floralShopCart_${user.username}`;
    let saved = localStorage.getItem(key);

    // If per-user cart not present but a legacy floralShopCart exists, migrate it
    if (!saved) {
      const legacy = localStorage.getItem("floralShopCart");
      if (legacy) {
        try {
          // move legacy cart into per-user key
          localStorage.setItem(key, legacy);
          // optionally remove legacy key to avoid confusion
          localStorage.removeItem("floralShopCart");
          saved = localStorage.getItem(key);
          console.info("Migrated legacy floralShopCart to", key);
        } catch (e) {
          console.error("Failed to migrate legacy cart:", e);
        }
      }
    }

    return saved ? JSON.parse(saved) : [];
  }

  // Save cart to localStorage
  saveCart() {
    const user = JSON.parse(localStorage.getItem("floralShopUser") || "null");
    if (!user || !user.username) {
      // No user: do not persist cart
      return;
    }
    const key = `floralShopCart_${user.username}`;
    localStorage.setItem(key, JSON.stringify(this.cart));
    this.updateCartCount();
  }

  // Add item to cart
  addItem(product) {
    // Always allow adding to cart (no login required)

    const existingItem = this.cart.find((item) => item.id === product.id);

    if (existingItem) {
      existingItem.quantity += product.quantity || 1;
    } else {
      this.cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        quantity: product.quantity || 1,
      });
    }

    this.saveCart();
    this.showAddToCartNotification(product.name);
  }

  // Remove item from cart
  removeItem(productId) {
    this.cart = this.cart.filter((item) => item.id !== productId);
    this.saveCart();
    this.renderCart();
  }

  // Update item quantity
  updateQuantity(productId, newQuantity) {
    if (newQuantity <= 0) {
      this.removeItem(productId);
      return;
    }

    const item = this.cart.find((item) => item.id === productId);
    if (item) {
      item.quantity = newQuantity;
      this.saveCart();
      this.renderCart();
    }
  }

  // Get cart total
  getSubtotal() {
    return this.cart.reduce(
      (total, item) => total + item.price * item.quantity,
      0
    );
  }

  getTotal() {
    return this.getSubtotal() + this.shippingFee;
  }

  // Update cart count in navigation
  updateCartCount() {
    // Intentionally suppress visual badge updates per site configuration.
    // Keep cart data consistent but do not display numbers under the cart icon.
    try {
      const countElement = document.getElementById("cart-count");
      if (countElement) {
        // clear content and hide to avoid any numeric display
        countElement.textContent = "";
        countElement.style.display = "none";
      }
    } catch (e) {}
  }

  // Format price to Vietnamese currency
  formatPrice(price) {
    return new Intl.NumberFormat("vi-VN").format(price) + "đ";
  }

  // Show add to cart notification
  showAddToCartNotification(productName) {
    // Create notification element
    const notification = document.createElement("div");
    notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #00b4a6, #4fd1c7);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 20px rgba(0, 180, 166, 0.3);
            z-index: 10000;
            font-weight: 600;
            animation: slideIn 0.3s ease-out;
        `;
    notification.innerHTML = `
            <i class="fas fa-check-circle" style="margin-right: 8px;"></i>
            Đã thêm "${productName}" vào giỏ hàng!
        `;

    // Add animation styles
    const style = document.createElement("style");
    style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
    document.head.appendChild(style);

    document.body.appendChild(notification);

    // Remove notification after 3 seconds
    setTimeout(() => {
      notification.style.animation = "slideIn 0.3s ease-out reverse";
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  // Render cart items on cart page
  renderCart() {
    const cartItemsContainer = document.getElementById("cart-items");
    const emptyCart = document.getElementById("empty-cart");
    const cartSummary = document.getElementById("cart-summary");

    if (this.cart.length === 0) {
      emptyCart.style.display = "block";
      cartItemsContainer.style.display = "none";
      cartSummary.style.display = "none";
      return;
    }

    emptyCart.style.display = "none";
    cartItemsContainer.style.display = "block";
    cartSummary.style.display = "block";

    // Render cart items
    cartItemsContainer.innerHTML = this.cart
      .map(
        (item) => `
            <div class="cart-item">
                <img src="${item.image}" alt="${item.name}" class="item-image">
                <div class="item-details">
                    <div class="item-name">${item.name}</div>
                    <div class="item-price">${this.formatPrice(
                      item.price
                    )}</div>
                </div>
                <div class="item-controls">
                    <div class="quantity-controls">
                        <button class="qty-btn" onclick="cartManager.updateQuantity('${
                          item.id
                        }', ${item.quantity - 1})" ${
          item.quantity <= 1 ? "disabled" : ""
        }>
                            <i class="fas fa-minus"></i>
                        </button>
                        <span class="quantity">${item.quantity}</span>
                        <button class="qty-btn" onclick="cartManager.updateQuantity('${
                          item.id
                        }', ${item.quantity + 1})">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                    <button class="remove-btn" onclick="cartManager.removeItem('${
                      item.id
                    }')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `
      )
      .join("");

    // Update summary
    this.updateSummary();
  }

  // Update cart summary
  updateSummary() {
    const subtotal = this.getSubtotal();
    const total = this.getTotal();

    document.getElementById("subtotal").textContent =
      this.formatPrice(subtotal);
    document.getElementById("shipping").textContent = this.formatPrice(
      this.shippingFee
    );
    document.getElementById("total").textContent = this.formatPrice(total);
  }

  // Clear cart
  clearCart() {
    this.cart = [];
    this.saveCart();
    this.renderCart();
  }
}

// Initialize cart manager
const cartManager = new CartManager();

// Functions for cart page
function proceedToCheckout() {
  if (cartManager.cart.length === 0) {
    alert("Giỏ hàng của bạn đang trống!");
    return;
  }

  // Populate checkout summary
  const checkoutSummary = document.getElementById("checkout-summary");
  const checkoutTotal = document.getElementById("checkout-total");

  checkoutSummary.innerHTML =
    cartManager.cart
      .map(
        (item) => `
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span>${item.name} x ${item.quantity}</span>
            <span>${cartManager.formatPrice(item.price * item.quantity)}</span>
        </div>
    `
      )
      .join("") +
    `
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span>Phí vận chuyển</span>
            <span>${cartManager.formatPrice(cartManager.shippingFee)}</span>
        </div>
    `;

  checkoutTotal.textContent = cartManager.formatPrice(cartManager.getTotal());

  // Show checkout modal
  document.getElementById("checkout-modal").style.display = "block";
}

function closeCheckoutModal() {
  document.getElementById("checkout-modal").style.display = "none";
}

function processPayment(event) {
  event.preventDefault();

  // Get form data
  const formData = new FormData(event.target);
  const orderData = {
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    note: formData.get("note"),
    payment: formData.get("payment"),
    items: cartManager.cart,
    subtotal: cartManager.getSubtotal(),
    shipping: cartManager.shippingFee,
    total: cartManager.getTotal(),
    orderDate: new Date().toISOString(),
  };

  // Generate order ID
  const orderId = "DH" + Date.now().toString().slice(-8);

  // Simulate payment processing
  const paymentBtn = event.target.querySelector(".place-order-btn");
  const originalText = paymentBtn.innerHTML;

  paymentBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
  paymentBtn.disabled = true;

  setTimeout(() => {
    // Hide checkout modal
    closeCheckoutModal();

    // Show success modal
    document.getElementById("order-id").textContent = orderId;
    document.getElementById("order-total").textContent =
      cartManager.formatPrice(orderData.total);
    document.getElementById("success-modal").style.display = "block";

    // Save order to localStorage (for demo purposes)
    const orders = JSON.parse(localStorage.getItem("floralShopOrders") || "[]");
    orders.push({ ...orderData, id: orderId });
    localStorage.setItem("floralShopOrders", JSON.stringify(orders));

    // Clear cart
    cartManager.clearCart();

    // Reset button
    paymentBtn.innerHTML = originalText;
    paymentBtn.disabled = false;

    // Send order data to console (in real app, send to server)
    console.log("Order placed:", orderData);
  }, 2000);
}

function closeSuccessModal() {
  document.getElementById("success-modal").style.display = "none";
  window.location.href = "index.html#products";
}

// Mobile menu toggle
function toggleMobileMenu() {
  const navMenu = document.getElementById("nav-menu");
  navMenu.classList.toggle("active");
}

function toggleSearch() {
  // Placeholder for search functionality
  alert("Chức năng tìm kiếm sẽ được phát triển trong tương lai!");
}

// Close modals when clicking outside
window.onclick = function (event) {
  const checkoutModal = document.getElementById("checkout-modal");
  const successModal = document.getElementById("success-modal");

  if (event.target === checkoutModal) {
    closeCheckoutModal();
  }
  if (event.target === successModal) {
    closeSuccessModal();
  }
};

// Initialize cart page when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  if (window.location.pathname.includes("cart.html")) {
    cartManager.renderCart();
  }
});
