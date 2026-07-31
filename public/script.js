// Landing page helpers only — login is handled by login.html + backend
try {
    if (typeof fswLogVisit === 'function') fswLogVisit('index');
} catch (e) { }

document.addEventListener('DOMContentLoaded', function () {
    const customerService = document.getElementById('customerService');
    const customerPopup = document.getElementById('customerPopup');
    const closeChat = document.getElementById('closeChat');
    const startChat = document.getElementById('startChat');

    if (customerService && customerPopup) {
        customerService.addEventListener('click', function () {
            customerPopup.style.display = 'block';
        });
    }
    if (closeChat && customerPopup) {
        closeChat.addEventListener('click', function () {
            customerPopup.style.display = 'none';
        });
    }
    if (startChat) {
        startChat.addEventListener('click', function () {
            window.location.href = '/login';
        });
    }

    const menuBtn = document.getElementById('menuBtn');
    const navMenu = document.getElementById('navMenu');
    if (menuBtn && navMenu) {
        const menuIcon = menuBtn.querySelector('i');
        menuBtn.addEventListener('click', function () {
            navMenu.classList.toggle('active');
            if (menuIcon) {
                if (navMenu.classList.contains('active')) {
                    menuIcon.classList.remove('fa-bars');
                    menuIcon.classList.add('fa-times');
                } else {
                    menuIcon.classList.remove('fa-times');
                    menuIcon.classList.add('fa-bars');
                }
            }
        });
        navMenu.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () {
                navMenu.classList.remove('active');
                if (menuIcon) {
                    menuIcon.classList.remove('fa-times');
                    menuIcon.classList.add('fa-bars');
                }
            });
        });
    }
});
