// scroll-end.js: scroll the page / the dialog to the end
(()=>{const d=[...document.querySelectorAll("[role=dialog]")].pop();[d,...d.querySelectorAll("*")].filter(e=>e.scrollHeight>e.clientHeight+5&&getComputedStyle(e).overflowY!="visible").forEach(e=>e.scrollTop=9999);document.scrollingElement.scrollTop=9999;return "ok"})()
