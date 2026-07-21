---
mode: agent
description: This prompt is used to generate Playwright tests for a given scenario
---

You are an expert in Playwright testing. 
Follow these steps:
1. Use Playwright MCP to execute the scenario described in the selection.
2. After MCP execution, write a Playwright test in Typescript that verifies the functionality described in the selection.

Test Scenario: ${input:scenario:Describe your test scenario here}
Make sure to:
* Use proper Playwright Test runner syntax and best practices.
* Add proper `test.describe` and `test` blocks
* Include assertions with `expect`
* Use appropriate selectors to interact with page elements.
* Create spec files after MCP execution
