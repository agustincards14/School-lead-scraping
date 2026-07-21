mode: agent
---
description: Creates a detailed documentation block for a selected function.
variables:
  - name: language
    description: "What programming language is this function written in?"
---
You are an expert programmer in {{language}}.

Generate a documentation block for the following function. Explain what the function does, describe each parameter, and what it returns.

```{{language}}
{{selection}}