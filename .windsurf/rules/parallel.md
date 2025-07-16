---
trigger: always_on
---

# 🌐 Ultimate Global Rules for Web Development

This document serves as a complete guideline for building modern, secure, and high-performance web systems, bots, tools, and AI-integrated platforms. All team members, agents, and systems must comply.

---

## 📁 1. Project Structure & Architecture

- Follow modular and scalable directory structure:
  ```
  /public
  /src
    /assets
    /components
    /layouts
    /pages
    /services
    /hooks
    /utils
    /types
  /tests
  ```
- Use TypeScript for all logic-heavy codebases.
- Follow a monorepo setup using Turborepo or Nx for multi-service projects.

---

## ⚙️ 2. Development Standards

- Use latest ECMAScript standards (ES2023+).
- Linting: ESLint with airbnb or custom strict rules.
- Formatting: Prettier with consistent rules across projects.
- Use Husky + lint-staged for pre-commit code checks.
- Use Volta or nvm to lock consistent Node.js versions.

---

## 🔒 3. Security Guidelines

- Always validate & sanitize all input data.
- Store secrets in `.env` files, never commit them.
- Use HTTPS, CSP headers, and secure cookies.
- Apply rate limiting, IP throttling, and anti-DDoS for APIs.
- Escape outputs in templates (XSS protection).

---

## 🧠 4. AI & Agent Integration

- AI decisions must be logged, explainable, and reversible.
- AI models must be versioned and monitored for drift.
- Always allow user override on critical decisions.
- Retrain only on approved and anonymized datasets.
- Use throttled inference queues for large model access.

---

## 🧪 5. Testing

- Unit: Jest, Vitest.
- Integration: Testing Library.
- E2E: Cypress or Playwright.
- Maintain 90%+ coverage on business logic and models.
- Tests must be isolated, parallel, and environment-independent.

---

## 🚀 6. Performance Optimization

- Lazy load all non-critical components.
- Compress images, use WebP by default.
- Minify JS/CSS in production.
- Enable HTTP/2 or HTTP/3 on backend servers.
- Use CDN for static and edge-optimized assets.

---

## 🖥️ 7. Frontend UI/UX

- Use accessible semantic HTML and ARIA where needed.
- Enforce WCAG 2.1 (AA) accessibility compliance.
- Support light and dark mode via CSS variables or tailwind themes.
- All UI must be responsive (mobile-first design).
- Avoid infinite scrolling unless paginated or buffered.

---

## 🔗 8. API & Backend Integration

- Use REST or GraphQL with strict type schemas (OpenAPI, Zod, io-ts).
- Handle all errors with informative messages and status codes.
- All APIs must implement:
  - Auth middleware
  - Rate limiting
  - Input validation
- Avoid circular dependencies and state bleed.

---

## 🗃️ 9. Data & Storage

- Use ORM (Prisma, TypeORM) with migrations in version control.
- Ensure all user data is encrypted at rest and in transit.
- Automatically expire and delete unused sensitive data.
- Use indexed queries and batch processing for scalability.

---

## 🌍 10. Internationalization (i18n) & Localization (l10n)

- Use i18next or vue-i18n for translation systems.
- All strings must be externalized – no hardcoding.
- Right-to-left (RTL) support must be available.
- Default language fallbacks are required.

---

## 🧩 11. CI/CD & Deployment

- All builds must go through CI pipelines:
  - Lint → Test → Build → Audit → Deploy Preview
- Use GitHub Actions, GitLab CI, or CircleCI.
- Every PR must include build preview (Vercel, Netlify, etc.).
- Use blue/green or canary deployment for major releases.

---

## 🧠 12. Documentation & Onboarding

- Maintain up-to-date `README.md`, `CONTRIBUTING.md`, and `CODE_OF_CONDUCT.md`.
- Use Storybook or Styleguidist for UI component documentation.
- Every service must include a usage manual or link to internal wiki.
- Code must include inline JSDoc/TSDoc comments for public methods.

---

## 🗺️ 13. Logging, Monitoring, and Error Handling

- Use structured logs (JSON format) via Winston or Pino.
- Use error tracking tools (Sentry, LogRocket).
- Set alert thresholds for performance degradation.
- Use health checks and uptime monitors.

---

## 📈 14. Analytics and Feedback

- Respect GDPR/CCPA. Never track PII without consent.
- Use privacy-first analytics tools (e.g., Plausible, Fathom).
- Integrate user feedback modules into UI.

---

## ♻️ 15. Maintenance and Upgrades

- Upgrade dependencies monthly or with security patches.
- Deprecate legacy APIs/components with proper warnings.
- Run tech debt audits quarterly.
- Archive or delete unused repos/services after 90 days of inactivity.

---

## ✅ Final Rule: Human Control

> All systems, bots, or agents must allow graceful shutdown, rollback, and user override. Autonomy is allowed, not dictatorship.

---