function isUserTypingNow() {
  const el = document.activeElement;
  return (
    el &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') &&
    !el.readOnly &&
    !el.disabled
  );
}

function getCurrentDeviceType() {
  const width = window.innerWidth;
  if (width <= 480) return "phone";
  if (width <= 768) return "tab";
  if (width <= 1024) return "lap";
  if (width <= 1440) return "pc";
  return "tv";
}

function hostAndConnect() {
  let hosts = document.querySelectorAll("input[host]");
  let connects = document.querySelectorAll("input[connect]");
  hosts.forEach(h => {
    connects.forEach(con => {
      let connectAttribute = con.getAttribute("connect");
      let hostAttribute = h.getAttribute("host");
      if (connectAttribute === hostAttribute) {
        h.addEventListener("input", () => {
          if (con.value !== h.value) {
            con.value = h.value;
            con.dispatchEvent(new Event("input", { bubbles: true }));
          }
        });
        con.addEventListener("input", () => {
          if (h.value !== con.value) {
            h.value = con.value;
            h.dispatchEvent(new Event("input", { bubbles: true }));
          }
        });
      }
    });
  });
}

function handleMoveTags() {
  document.querySelectorAll("move[ele]").forEach(moveTag => {
    const selector = moveTag.getAttribute("ele");
    if (!selector) return;

    let original;
    if (selector.includes("@")) {
      const parts = selector.split("@");
      let base = document.querySelector(parts[0]);
      for (let i = 1; i < parts.length && base; i++) {
        base = base.querySelector(parts[i]);
      }
      original = base;
    } else {
      original = document.querySelector(selector);
    }

    if (!original) return;

    const moveAttributes = [...moveTag.attributes].filter(attr => attr.name !== "ele");
    let existing = moveTag.querySelector(original.tagName);
    const isInput = original.tagName === "INPUT" || original.tagName === "TEXTAREA";

    const shouldReplace =
      !existing ||
      moveAttributes.some(attr => existing.getAttribute(attr.name) !== attr.value) ||
      (isInput && existing.value !== original.value);

    if (!shouldReplace) return;
    if (existing) existing.remove();

    const clone = original.cloneNode(true);
    moveAttributes.forEach(attr => clone.setAttribute(attr.name, attr.value));
    if (isInput) clone.value = original.value;

    moveTag.appendChild(clone);
  });
}

function moveElementsIntoActiveIf() {
  const currentDevice = getCurrentDeviceType();
  const matchingIfBlocks = [...document.querySelectorAll("if-block")].filter(el => {
    const devices = el.getAttribute("device")?.split("||").map(d => d.trim());
    return devices?.includes(currentDevice);
  });

  for (const activeIf of matchingIfBlocks) {
    const selector = activeIf.getAttribute("move");
    if (!selector) continue;

    let elementToMove = document.querySelector(selector);
    if (!elementToMove) {
      document.querySelectorAll("if-block").forEach(ifEl => {
        const maybe = ifEl.querySelector(selector);
        if (maybe) elementToMove = maybe;
      });
    }

    if (!elementToMove) continue;

    document.querySelectorAll("if-block").forEach(ifEl => {
      const existing = ifEl.querySelector(selector);
      if (existing) existing.remove();
    });

    if (elementToMove.parentElement) elementToMove.remove();
    activeIf.appendChild(elementToMove);
  }
}

function updateTargetBlockVisibility(root) {
  const allTargets = (root || document).querySelectorAll("target-block[element][has]");
  allTargets.forEach(target => {
    const sel = target.getAttribute("element");
    const required = target.getAttribute("has");
    const scope = root || document;
    const targetEl = scope.querySelector(sel);
    const hasClass = targetEl?.classList.contains(required.replace(/^\./, ""));

    if (hasClass) {
      target.setAttribute("data-active", "true");
    } else {
      target.removeAttribute("data-active");
    }
  });
}

function applyDynamicStylesToElement(root) {
  updateTargetBlockVisibility(root);

  const propertyMap = {
    marginT: "margin-top", marginR: "margin-right",
    marginB: "margin-bottom", marginL: "margin-left",
    paddingT: "padding-top", paddingR: "padding-right",
    paddingB: "padding-bottom", paddingL: "padding-left",
    fs: "font-size"
  };

  const currentDevice = getCurrentDeviceType();

  const all = [...(root || document).querySelectorAll("[class*='{']")].filter(el => {
    const ifb = el.closest("if-block");
    if (ifb) {
      const devs = (ifb.getAttribute("device") || "").split("||").map(d => d.trim());
      if (!devs.includes(currentDevice)) return false;
    }

    const target = el.closest("target-block[element][has]");
    if (target) {
      const sel = target.getAttribute("element");
      const required = target.getAttribute("has");
      const scope = root || document;
      const targetEl = scope.querySelector(sel);
      const hasClass = targetEl?.classList.contains(required.replace(/^\./, ""));
      if (hasClass) {
        target.setAttribute("data-active", "true");
      } else {
        target.removeAttribute("data-active");
        return false;
      }
    }
    return true;
  });

  all.forEach(el => {
    const classAttr = el.getAttribute("class");
    const match = classAttr.match(/\{([^}]+)\}/);
    if (!match) return;

    const rules = match[1].split(";").map(r => r.trim()).filter(Boolean);
    rules.forEach(rule => {
      let [rawProp, expr] = rule.split(":").map(s => s.trim());
      if (!rawProp || !expr) return;

      const prop = propertyMap[rawProp] || rawProp;
      let important = false;
      if (expr.endsWith("!i")) {
        important = true;
        expr = expr.slice(0, -3).trim();
      }

      expr = expr.replace(/\$t\$\.(.+?)_(H|W)/g, (_, chain, dim) => {
        const parts = chain.split("@");
        let node = el.closest(parts[0].startsWith(".") ? parts[0] : `.${parts[0]}`);
        for (let i = 1; i < parts.length && node; i++) {
          node = node.querySelector(parts[i]);
        }
        return node ? (dim === "H" ? node.offsetHeight : node.offsetWidth) : "0";
      });

      expr = expr.replace(/([.#][\w@-]+(?:@[.#][\w@-]+)*)_(H|W)/g, (fullMatch, sel, dim) => {
        const parts = sel.split("@");
        let base = (root || document).querySelector(parts[0]);
        for (let i = 1; i < parts.length && base; i++) {
          base = base.querySelector(parts[i]);
        }
        if (!base) return "0";

        const ifb = base.closest("if-block");
        if (ifb) {
          const devs = (ifb.getAttribute("device") || "").split("||").map(d => d.trim());
          if (!devs.includes(currentDevice)) return "0";
        }

        return dim === "H" ? base.offsetHeight : base.offsetWidth;
      });

      try {
        const val = Function(`return ${expr}`)();
        if (!isNaN(val)) {
          el.style.setProperty(prop, val + "px", important ? "important" : "");
        }
      } catch (err) {
        console.warn(`Failed to evaluate class-style expression: "${expr}"`, err);
      }
    });
  });
}

function applyDynamicStyles() {
  applyDynamicStylesToElement(document);
}

// ✅ Throttled updater using rAF
let styleUpdateScheduled = false;
function scheduleApplyDynamicStyles() {
  if (!styleUpdateScheduled) {
    styleUpdateScheduled = true;
    requestAnimationFrame(() => {
      if (!isUserTypingNow()) {
        applyDynamicStyles();
      }
      styleUpdateScheduled = false;
    });
  }
}

let mutationObserver = null;
let resizeObserver = null;

function connectLayoutObservers() {
  if (!mutationObserver) {
    mutationObserver = new MutationObserver(() => scheduleApplyDynamicStyles());
    document.querySelectorAll(".___layout").forEach(lay => {
      mutationObserver.observe(lay, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "ds", "device", "has", "element"],
      });
    });
  }

  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(() => scheduleApplyDynamicStyles());
    resizeObserver.observe(document.body);
  }
}

function disconnectLayoutObservers() {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
}

function setBodyHeight() {
  document.body.style.height = window.innerHeight + "px";
}

function init() {
  setTimeout(() => {
    setBodyHeight();
    moveElementsIntoActiveIf();
    handleMoveTags();
    hostAndConnect();
    scheduleApplyDynamicStyles();
  }, 50);
}

window.addEventListener("DOMContentLoaded", init);
window.addEventListener("resize", init);

function observeLayoutChanges() {
  connectLayoutObservers();
}

observeLayoutChanges();

/*
Notes:
- Dynamic style recalculations are batched with requestAnimationFrame.
- Avoids layout thrash by caching and throttling.
- Theme supported: theme="dark" | theme="light".
*/














document.querySelectorAll(".layout-pc .nav-contents__section").forEach(section => {
  section.addEventListener("mouseenter" , () => {
    enterSectionName(section)
  })
  section.addEventListener("mouseleave" , () => {
    leaveSectionName(section)
  })
})
function enterSectionName(ele) {
 let text = ele.querySelector("span");
 let icon = ele.querySelector("i");
 
 
 icon.style.transform = `translateY(-${text.clientHeight / 2}px)`;
 text.style.transform = `translateY(-${text.clientHeight / 2}px) scale(1)`;
 text.style.opacity = 1;
 
}
function leaveSectionName(ele) {
 let text = ele.querySelector("span");
 let icon = ele.querySelector("i");
 
 
 icon.style.transform = `translateY(-${0}px)`;
 
 text.style.transform = `translateY(-${0}px) scale(0.9)`;
  text.style.opacity = 0;
}

function getNumberFromCss(value) {
 let val = Number(value.replace("px" , ""));
 return val == NaN ? 0 : val;
}
// only pc
let pcLayout = document.querySelector(".layout-pc");
pcLayout.addEventListener("scroll" , () => {
  let scroll = pcLayout.scrollTop;
  
 let nav = document.querySelector(".layout-pc .nav");
  
  let landingHead = document.querySelector(".layout-pc .landing-head");
 let landingHead__profile = landingHead.querySelector(".layout-pc .profile-photo");
 let landingHeadContents = landingHead.querySelector(".layout-pc .landing-head-content");
  let progressBar = document.querySelector(".layout-pc #pc-progress-bar");
  let aboutSection = document.querySelector(".layout-pc #pc-about-me-contents");
  let sections = {
    "aboutMe": document.querySelector(".layout-pc #indicator-about-me"),
    "experience": document.querySelector(".layout-pc #indicator-experience-me"),
    "contact": document.querySelector(".layout-pc #indicator-contact-me"),
  }
let experienceSection = document.querySelector(".layout-pc #pc-experience-section");
let contactSection = document.querySelector(".layout-pc #pc-contact-section");




if (scroll >= (nav.clientHeight * 2)) {
  if (!landingHeadContents.className.includes("landing-head-content-inactive"))
landingHeadContents.className += " landing-head-content-inactive";
}
  else {
    
  landingHeadContents.className = landingHeadContents.className.replace("landing-head-content-inactive" , "");

  }

if (scroll > (landingHead.clientHeight - landingHead__profile.clientHeight)
  && scroll < (landingHead.clientHeight + (aboutSection.querySelector(".about-me-card").clientHeight - (nav.clientHeight * 2)))) {

  if (getNumberFromCss(progressBar.style.width) != sections.aboutMe.clientWidth) {

     progressBar.style.width = sections.aboutMe.clientWidth + "px";
     
     leaveSectionName(sections.experience)
     leaveSectionName(sections.contact)
     leaveSectionName(sections.aboutMe)
     enterSectionName(sections.aboutMe)
    let blend = document.querySelector(".layout-pc .blend-image");
    if (!blend.className.includes("blend-image--active")) {
blend.className += " blend-image--active";
    }

    }
    if (sections.aboutMe.className.includes("_nav-contents__section--active")) {
      leaveSectionName(sections.aboutMe)
      sections.aboutMe.className = sections.aboutMe.className.replace("_nav-contents__section--active" , "")
      enterSectionName(sections.aboutMe)
      let blend = document.querySelector(".layout-pc .blend-image");
    if (!blend.className.includes("blend-image--active")) {
blend.className += " blend-image--active";
    }
    blend.className = blend.className.replace("blend-image--normal" , " blend-image-active");
    }
    
   let blend = document.querySelector(".layout-pc .blend-image");
   if (!blend.className.includes("blend-image-active")) {
    blend.className += " blend-image-active";
   }
blend.className = blend.className.replace("blend-image--normal" , " blend-image-active");

 if (!experienceSection.className.includes("experience-section--normal")) {
   experienceSection.className += " experience-section--normal";
   }
 

  }

    
  
    else if (scroll >= (landingHead.clientHeight + (aboutSection.querySelector(".about-me-card").clientHeight - (nav.clientHeight * 2)))
      && scroll < (landingHead.clientHeight + (aboutSection.querySelector(".about-me-card").clientHeight - (nav.clientHeight * 2)) + experienceSection.clientHeight)) {
 if (getNumberFromCss(progressBar.style.width) != (sections.aboutMe.clientWidth * 2)) {

   progressBar.style.width = sections.aboutMe.clientWidth * 2 + "px";
     leaveSectionName(sections.contact)
   leaveSectionName(sections.aboutMe)
   if (!sections.aboutMe.className.includes("_nav-contents__section--active")) {
    sections.aboutMe.className += " _nav-contents__section--active";
   }
    sections.experience.className = sections.experience.className.replace("_nav-contents__section--active" , "")
    sections.contact.className = sections.contact.className.replace("_nav-contents__section--active" , "")
leaveSectionName(sections.experience)
   enterSectionName(sections.experience)
   if (experienceSection.className.includes("experience-section--normal")) {
   experienceSection.className = experienceSection.className.replace("experience-section--normal" , "");
   }
  }
  }
  
  else if (scroll >= (landingHead.clientHeight + (aboutSection.querySelector(".about-me-card").clientHeight - (nav.clientHeight * 2)) + experienceSection.clientHeight)) {
    
     if (getNumberFromCss(progressBar.style.width) != (sections.aboutMe.clientWidth * 3)) {

       progressBar.style.width = sections.aboutMe.clientWidth * 3 + "px";
       leaveSectionName(sections.experience)
       leaveSectionName(sections.aboutMe)
       if (!sections.experience.className.includes("_nav-contents__section--active") || !sections.aboutMe.className.includes("_nav-contents__section--active") ) {
    sections.experience.className += " _nav-contents__section--active";
    sections.aboutMe.className += " _nav-contents__section--active";
   }
    
    sections.contact.className = sections.contact.className.replace("_nav-contents__section--active" , "")
leaveSectionName(sections.contact)
   enterSectionName(sections.contact)
      }
     
    
}

else if (scroll <= ((landingHead.clientHeight - landingHead__profile.clientHeight) + experienceSection.clientHeight + contactSection.clientHeight)) {
  
  progressBar.style.width = "0";
  leaveSectionName(sections.aboutMe)
  leaveSectionName(sections.experience)
  leaveSectionName(sections.contact)
  sections.contact.className = sections.contact.className.replace("_nav-contents__section--active" , "")
  sections.experience.className = sections.experience.className.replace("_nav-contents__section--active" , "")
  sections.aboutMe.className = sections.aboutMe.className.replace("_nav-contents__section--active" , "")
  let blend = document.querySelector(".layout-pc .blend-image");
  blend.className = blend.className.replace("blend-image--active" , "blend-image--normal");
}



  



})
let phoneLayout = document.querySelector(".layout-phone");

phoneLayout.addEventListener("scroll" , () => {
let scroll = phoneLayout.scrollTop;
let aboutMe = document.getElementById("phone-about-me");
let experience = document.getElementById("phone-experience");
let contact = document.getElementById("phone-contact");
let landingHead = document.getElementById("phone-landing-head");
let nav = document.querySelector(".phone-nav");
let sections = {
  "aboutMe": document.getElementById("phone-about-me-nav"),
  "experience": document.getElementById("phone-experience-nav"),
  "contact": document.getElementById("phone-contact-nav"),
}
let progressBar = document.getElementById("phone-progress-bar");
if (scroll > (landingHead.clientHeight - (nav.clientHeight * 3)) &&
scroll < ((landingHead.clientHeight + aboutMe.clientHeight) - (nav.clientHeight * 6))) {
  enterPhoneSection(sections.aboutMe);
  leavePhoneSection(sections.contact)
  leavePhoneSection(sections.experience)
  progressBar.style.width = sections.aboutMe.clientWidth + 'px';
 let aboutMeCard = document.querySelector(".phone-about-me-card");
 if (!aboutMeCard.className.includes("phone-about-me-card-active")) {
  aboutMeCard.className += " phone-about-me-card-active";
  aboutMeCard.className = aboutMeCard.className.replace("phone-about-me-card-normal" , "");
 }
 let invWall = document.querySelector(".layout-phone .phone-expereince-inv-wall");
  if (invWall.className.includes("inv-wall--disable")) {

    invWall.className = invWall.className.replace("inv-wall--disable" , "");
  }
   let pe = document.querySelector(".phone-experience")
 if (!pe.className.includes("phone-experience-disable")) {
  pe.className += " phone-experience-disable";
 }
 let phoneContact = document.querySelector(".phone-contact");
 if (phoneContact.className.includes("phone-contact--active")) {
  phoneContact.className = phoneContact.className.replace("phone-contact--active" , "");
 }
 
 

}
else if (scroll > ((landingHead.clientHeight + aboutMe.clientHeight) - (nav.clientHeight * 6)) &&
scroll < (landingHead.clientHeight + aboutMe.clientHeight + experience.clientHeight - (nav.clientHeight * 2))) {
  
  enterPhoneSection(sections.experience);
  leavePhoneSection(sections.aboutMe)
  leavePhoneSection(sections.contact)
  progressBar.style.width = (sections.aboutMe.clientWidth * 2) + 'px';
  let invWall = document.querySelector(".layout-phone .phone-expereince-inv-wall");
  if (!invWall.className.includes("inv-wall--disable")) {

    invWall.className += " inv-wall--disable";
  }
 let pe = document.querySelector(".phone-experience")
 if (pe.className.includes("phone-experience-disable")) {
  pe.className = pe.className.replace("phone-experience-disable" , "")
 }
  let phoneContact = document.querySelector(".phone-contact");
 if (phoneContact.className.includes("phone-contact--active")) {
  phoneContact.className = phoneContact.className.replace("phone-contact--active" , "");
 }
}
else if (scroll > (landingHead.clientHeight + aboutMe.clientHeight + experience.clientHeight - (nav.clientHeight * 2))) {
  enterPhoneSection(sections.contact);
  leavePhoneSection(sections.aboutMe)
  leavePhoneSection(sections.experience)
  progressBar.style.width = (sections.aboutMe.clientWidth * 3) + 'px';
   let phoneContact = document.querySelector(".phone-contact");
 if (!phoneContact.className.includes("phone-contact--active")) {
  phoneContact.className += " phone-contact--active";
 }
}
else {
   leavePhoneSection(sections.contact);
  leavePhoneSection(sections.aboutMe)
  leavePhoneSection(sections.experience)
  progressBar.style.width = 0 + 'px';
   let aboutMeCard = document.querySelector(".phone-about-me-card");
 if (!aboutMeCard.className.includes("phone-about-me-card-normal")) {
  aboutMeCard.className += " phone-about-me-card-normal";
  aboutMeCard.className = aboutMeCard.className.replace("phone-about-me-card-active" , "");
 }
let phoneContact = document.querySelector(".phone-contact");
 if (phoneContact.className.includes("phone-contact--active")) {
  phoneContact.className = phoneContact.className.replace("phone-contact--active" , "");
 }
  
}

});

function enterPhoneSection(section , width = false) {
  if (width) {

    let aside = section.querySelector("aside")
    aside.className = "phone-nav-contents__content__aside--active";
  }
if (!section.className.includes("phone-nav-contents__content--active")) {
  section.className += " phone-nav-contents__content--active";
}
}
function leavePhoneSection(section , width = false) {
  if (width) {

    let aside = section.querySelector("aside")
    aside.className = "";
  }
section.className = section.className.replace("phone-nav-contents__content--active" , "")
}
function copyDetail(ele) {
  const text = ele.querySelector("._text").innerText;

  if (navigator.clipboard && window.isSecureContext) {
    // Modern secure context: works in most browsers
    navigator.clipboard.writeText(text).catch((err) => {
      console.error("Clipboard API failed", err);
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  // Create a hidden textarea off-screen to prevent UI disruption
  const textArea = document.createElement("textarea");

  // Set styles to hide it completely and prevent keyboard pop-up
  textArea.style.position = "fixed";
  textArea.style.top = "-9999px";
  textArea.style.left = "-9999px";
  textArea.setAttribute("readonly", ""); // Prevent mobile keyboard
  textArea.value = text;

  document.body.appendChild(textArea);
  textArea.select();

  try {
    const successful = document.execCommand("copy");
    if (!successful) throw new Error("Copy command unsuccessful");
  } catch (err) {
    console.error("Fallback copy failed", err);
    alert("Failed to copy text");
  }

  document.body.removeChild(textArea);
}


document.querySelectorAll(".layout-phone .phone-nav-contents__content").forEach(content => {
  content.addEventListener("mouseenter" , () => enterPhoneSection(content))
  content.addEventListener("mouseleave" , () => leavePhoneSection(content))
})

// the phone experience is not great in scroll snap align so do something