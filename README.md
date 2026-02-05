# Simplify Icons 🛠️

**Simplify Icons** is a Figma plugin designed to solve the age-old problem of "broken icon colors." It automates the tedious process of normalizing layer structures, naming, and constraints so that your color overrides stay preserved during instance swapping.

## 🚀 Why this exists
In Figma, color overrides only persist if the layer names and hierarchies are identical between components. Most icon sets (including Material Symbols) come with messy groupings or inconsistent naming. This plugin fixes that in a single click.

## ✨ Features
- **Flatten & Rename**: Collapses complex vector paths into a single layer named "Vector."
- **Constraint Automation**: Automatically sets all icon contents to "Scale/Scale."
- **Flexible Coloring**: 
  - Keep **Original** colors.
  - Apply a custom **HEX** value.
  - Link directly to your design system's **Figma Styles or Variables**.
- **Native UI**: Built with Figma Design Tokens for a seamless Light/Dark mode experience.

## 🛠️ Technical Stack
- **Language**: TypeScript
- **Framework**: Figma Plugin API
- **Build Tool**: TSC (TypeScript Compiler)
- **UI**: HTML/CSS/JavaScript

## 📦 How to Run Locally
1. Clone this repository.
2. Install dependencies: `npm install`.
3. Build the project: `npm run build` or `tsc --watch`.
4. In Figma, go to **Plugins > Development > Import plugin from manifest...** and select the `manifest.json` in this folder.

## 📝 The Journey
This project started as a way to speed up my own workflow when working with large icon libraries. It involved diving deep into the Figma API to handle asynchronous document access and variable resolution. 

---
*Created by Matt Holihan*
