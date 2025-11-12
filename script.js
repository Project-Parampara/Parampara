document.addEventListener('DOMContentLoaded', () => {
  // **************************************
  // Async translation function (calls your Node backend)
  async function translateText(text, targetLang) {
    const response = await fetch('http://127.0.0.1:3001/api/translate', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target: targetLang }),
    });
    const data = await response.json();
    return data.translatedText || text;
  }

  // *************************************
  // Dynamic Translation Manager
  class DynamicTranslator {
    constructor(languageSelectId) {
      this.languageSelect = document.getElementById(languageSelectId);
      this.currentLang = this.languageSelect ? this.languageSelect.value : 'en';
      this.originalTexts = {};

      if (this.languageSelect) {
        this.languageSelect.addEventListener('change', () => {
          this.currentLang = this.languageSelect.value || 'en';
          this.applyTranslations();
        });
      }
      this.captureOriginalTexts();
      this.applyTranslations();
    }

    captureOriginalTexts() {
      // Hero section
      this.originalTexts['.hero-title'] = document.querySelector('.hero-title')?.textContent || "";
      this.originalTexts['.hero-subtitle'] = document.querySelector('.hero-subtitle')?.textContent || "";
      this.originalTexts['.cta-button'] = document.querySelector('.cta-button')?.textContent || "";

      // Nav menu links
      this.originalTexts['.nav-menu a[href="#home"]'] = document.querySelector('.nav-menu a[href="#home"]')?.textContent || "";
      this.originalTexts['.nav-menu a[href="treasure_hunt.html"]'] = document.querySelector('.nav-menu a[href="treasure_hunt.html"]')?.textContent || "";
      this.originalTexts['.nav-menu a[href="#community"]'] = document.querySelector('.nav-menu a[href="#community"]')?.textContent || "";
      this.originalTexts['.nav-menu a[href="quiz.html"]'] = document.querySelector('.nav-menu a[href="quiz.html"]')?.textContent || "";
      this.originalTexts['.nav-menu a[href="#feedback"]'] = document.querySelector('.nav-menu a[href="#feedback"]')?.textContent || "";

      // Story form
      this.originalTexts['#story-submit'] = document.getElementById('story-submit')?.textContent || "";
      this.originalTexts['#story-name'] = document.getElementById('story-name')?.placeholder || "";
      this.originalTexts['#story-input'] = document.getElementById('story-input')?.placeholder || "";

      // Feedback form text/placeholder
      this.originalTexts['#paramparaFeedbackForm_name'] = document.getElementById('paramparaFeedbackForm_name')?.placeholder || "";
      this.originalTexts['#paramparaFeedbackForm_email'] = document.getElementById('paramparaFeedbackForm_email')?.placeholder || "";
      this.originalTexts['#paramparaFeedbackForm_comments'] = document.getElementById('paramparaFeedbackForm_comments')?.placeholder || "";

      // Section Headings
      this.originalTexts['#feedbackSectionHeading'] = document.getElementById('feedbackSectionHeading')?.textContent || "";
      this.originalTexts['#communitySectionHeading'] = document.getElementById('communitySectionHeading')?.textContent || "";

      // Category Cards
      document.querySelectorAll('.category-card').forEach(card => {
        const cat = card.getAttribute('data-category');
        const h3 = card.querySelector('h3');
        if (cat && h3) {
          this.originalTexts[`[data-category="${cat}"] h3`] = h3.textContent;
        }
      });

      // Current Category
      const currentCategoryElem = document.getElementById('currentCategory');
      if (currentCategoryElem) {
        this.originalTexts['#currentCategory'] = currentCategoryElem.textContent || "";
      }
    }

    async applyTranslations() {
      if (this.currentLang === 'en') {
        for (let selector in this.originalTexts) {
          const el = selector.startsWith('#') ?
            document.getElementById(selector.slice(1)) :
            document.querySelector(selector);
          if (el) {
            if (el.placeholder !== undefined && this.originalTexts[selector]) {
              el.placeholder = this.originalTexts[selector];
            } else if (this.originalTexts[selector]) {
              el.textContent = this.originalTexts[selector];
            }
          }
        }
        return;
      }
      for (let selector in this.originalTexts) {
        const el = selector.startsWith('#') ?
          document.getElementById(selector.slice(1)) :
          document.querySelector(selector);
        const text = this.originalTexts[selector];
        if (el && text) {
          const translated = await translateText(text, this.currentLang);
          if (el.placeholder !== undefined) {
            el.placeholder = translated;
          } else {
            el.textContent = translated;
          }
        }
      }
    }
  }

  new DynamicTranslator('languageSelect');

  // *************************************
  // Story Management
  class Story {
    constructor(name, story, location = "") {
      this.name = name || "Anonymous";
      this.story = story;
      this.location = location;
    }

    render() {
      return `
        <div class="story-card" style="background: #fff7de; border-radius: 10px; padding: 18px 22px; max-width: 650px; text-align: left; border-left: 5px solid #ffb22d; box-shadow: 0 4px 18px rgba(0,0,0,0.1); color: #6b3f00;">
          <p class="story-text" style="font-size: 1.05em; line-height: 1.5; margin-bottom: 10px;">“${this.story}”</p>
          <span class="story-author" style="color: #bf8400; font-size: 0.95em; font-style: italic;">— ${this.name}${this.location ? ", " + this.location : ""}</span>
        </div>
      `;
    }
  }

  class StoryManager {
    constructor(feedElementId) {
      this.feedElement = document.getElementById(feedElementId);
      this.stories = [];
    }

    addStory(story) {
      this.stories.unshift(story);
      this.renderStories();
    }

    renderStories() {
      this.feedElement.innerHTML = this.stories.map(story => story.render()).join("");
    }
  }

  const storyManager = new StoryManager("stories-feed");
  storyManager.addStory(new Story("Ananya Rao", "Visiting the temples of Hampi made me realize how art, devotion, and architecture blend beautifully in our heritage.", "Karnataka"));
  storyManager.addStory(new Story("Meera Nair", "Onam celebrations made me appreciate the spiritual unity of Kerala’s customs.", "Kerala"));

  document.getElementById("story-submit").onclick = async () => {
    const nameField = document.getElementById("story-name");
    const storyField = document.getElementById("story-input");
    const name = nameField.value.trim() || "Anonymous";
    const story = storyField.value.trim();

    if (story.length < 10) {
      storyField.style.borderColor = "#ff6666";
      storyField.focus();
      return;
    }
    storyField.style.borderColor = "#ffbb33";

    let translatedStory = story;
    const lang = document.getElementById('languageSelect')?.value || 'en';
    if (lang !== 'en') {
      translatedStory = await translateText(story, lang);
    }

    storyManager.addStory(new Story(name, translatedStory));
    nameField.value = "";
    storyField.value = "";
  };

  // *************************************
  // Feedback Management
  class Feedback {
    constructor(name, email, rating, comments) {
      this.name = name;
      this.email = email;
      this.rating = rating;
      this.comments = comments;
    }

    render() {
      return `
        <p style="font-size: 1.05em; line-height: 1.5; margin-bottom: 10px;">"${this.comments}"</p>
        <span style="color: #bf8400; font-size: 0.95em; font-style: italic;">
          — ${this.name} (${this.email}) - Rating: ${'★'.repeat(this.rating)}${'☆'.repeat(5 - this.rating)}
        </span>
      `;
    }
  }

  class FeedbackManager {
    constructor(formId, messageId, listId, starContainerId, ratingInputId) {
      this.form = document.getElementById(formId);
      this.feedbackMessage = document.getElementById(messageId);
      this.feedbackList = document.getElementById(listId);
      this.stars = document.querySelectorAll(`#${starContainerId} span`);
      this.ratingInput = document.getElementById(ratingInputId);

      this.storedFeedback = JSON.parse(localStorage.getItem('paramparaFeedback')) || [];
      this.renderStoredFeedback();
      this.attachEvents();
    }

    renderStoredFeedback() {
      this.storedFeedback.forEach(fb => this.addFeedbackToList(new Feedback(fb.name, fb.email, fb.rating, fb.comments)));
    }

    addFeedback(feedback) {
      this.storedFeedback.push(feedback);
      localStorage.setItem('paramparaFeedback', JSON.stringify(this.storedFeedback));
      this.addFeedbackToList(feedback);
    }

    addFeedbackToList(feedback) {
      const div = document.createElement('div');
      div.className = 'feedback-item';
      div.style.cssText = 'background: #fff7de; border-radius: 10px; padding: 18px 22px; max-width: 650px; text-align: left; border-left: 5px solid #ffb22d; box-shadow: 0 4px 18px rgba(0,0,0,0.1); color: #6b3f00;';
      div.innerHTML = feedback.render();
      this.feedbackList.prepend(div);
    }

    attachEvents() {
      this.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = this.form.name.value.trim();
        const email = this.form.email.value.trim();
        const rating = parseInt(this.ratingInput.value);
        const comments = this.form.comments.value.trim();
        const lang = document.getElementById('languageSelect')?.value || 'en';

        if (rating < 1 || comments.length === 0) {
          return;
        }

        let translatedComments = comments;
        if (lang !== 'en') {
          translatedComments = await translateText(comments, lang);
        }

        const newFeedback = new Feedback(name, email, rating, translatedComments);
        this.addFeedback(newFeedback);

        this.feedbackMessage.style.display = 'block';
        this.form.reset();
        this.resetStars();

        setTimeout(() => {
          this.feedbackMessage.style.display = 'none';
        }, 3000);
      });

      this.stars.forEach(star => {
        star.addEventListener('mouseover', () => this.highlightStars(star.dataset.value));
        star.addEventListener('mouseout', () => this.highlightStars(this.ratingInput.value));
        star.addEventListener('click', () => {
          this.ratingInput.value = star.dataset.value;
          this.highlightStars(star.dataset.value);
        });
      });
    }

    highlightStars(rating) {
      this.stars.forEach(star => {
        star.style.color = star.dataset.value <= rating ? '#FFD700' : '#ccc';
      });
    }

    resetStars() {
      this.highlightStars(0);
    }
  }

  new FeedbackManager('paramparaFeedbackForm', 'feedbackMessage', 'feedbackList', 'starRating', 'rating');

  // ********** Site Form Submission Handler **********
  const addSiteForm = document.getElementById('addSiteForm');
  if (addSiteForm) {
    addSiteForm.onsubmit = function(e) {
      e.preventDefault();
      const formData = new FormData(addSiteForm);
      const data = Object.fromEntries(formData.entries());
      if (typeof stateName !== 'undefined' && stateName) data.state = stateName;
      const submitBtn = addSiteForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      fetch('http://localhost:3000/api/add-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(res => {
        if (!res.ok) throw new Error(`Server responded with status ${res.status}`);
        return res.json();
      })
      .then(res => {
        if (res.success) {
          alert('✅ Site added successfully! Thank you for your contribution.');
          addSiteForm.reset();
          if (typeof districtName !== 'undefined') document.getElementById('districtInput').value = districtName;
        } else {
          alert('❌ Failed to add site: ' + (res.error || res.message || 'Unknown error'));
        }
      })
      .catch(err => {
        alert('❌ Error submitting site: ' + err.message + '\n\nPlease ensure:\n1. Backend server is running\n2. Server has the /api/add-site endpoint\n3. CORS is enabled on the server');
      })
      .finally(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      });
    };
  }

  // ********** Navigation Guard for Login **********
  const protectedSelectors = [
    'a[href="treasure_hunt.html"]',
    'a[href="quiz.html"]',
    '.cta-button'
  ];

  function requireLogin(e) {
    const loggedIn = localStorage.getItem('parampara_logged_in');
    if (!loggedIn || loggedIn !== 'true') {
      e.preventDefault();
      alert("Please login to access this feature.");
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  protectedSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      el.addEventListener('click', requireLogin, false);
    });
  });

});
