"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
figma.showUI(__html__, { width: 400, height: 600, themeColors: true });
function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + ((r * 255) | 0) * 65536 + ((g * 255) | 0) * 256 + ((b * 255) | 0)).toString(16).slice(1).toUpperCase();
}
function resolveColorFromVariable(variable) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Resolve for current context (first selection or page)
            const context = figma.currentPage.selection[0] || figma.currentPage;
            const { value } = variable.resolveForConsumer(context);
            if (value.type === "VARIABLE_ALIAS") {
                const aliasId = value.id;
                const aliasedVar = yield figma.variables.getVariableByIdAsync(aliasId);
                if (aliasedVar) {
                    return yield resolveColorFromVariable(aliasedVar);
                }
            }
            else if (typeof value === "object" && "r" in value) {
                const { r, g, b } = value;
                return rgbToHex(r, g, b);
            }
        }
        catch (e) {
            // console.error("Failed to resolve variable", variable.name, e);
        }
        return null;
    });
}
function getLocalColorAssets() {
    return __awaiter(this, void 0, void 0, function* () {
        const styles = yield figma.getLocalPaintStylesAsync();
        const variables = yield figma.variables.getLocalVariablesAsync("COLOR");
        const styleAssets = styles.map(s => {
            let hex = "#CCCCCC";
            if (s.paints[0] && s.paints[0].type === "SOLID") {
                const { r, g, b } = s.paints[0].color;
                hex = rgbToHex(r, g, b);
            }
            const parts = s.name.split("/");
            const group = parts.length > 1 ? parts[0].trim() : "Other";
            const name = parts.length > 1 ? parts.slice(1).join("/").trim() : s.name;
            return { id: s.id, name, group, type: "STYLE", hex };
        });
        const variableAssets = yield Promise.all(variables.map((v) => __awaiter(this, void 0, void 0, function* () {
            // For variables, we might not get a resolved color easily without context.
            // Use a placeholder or attempt basic resolution if possible, but keeping it simple/safe is better.
            const parts = v.name.split("/");
            const group = parts.length > 1 ? parts[0].trim() : "Other";
            const name = parts.length > 1 ? parts.slice(1).join("/").trim() : v.name;
            const hex = yield resolveColorFromVariable(v);
            return { id: v.id, name, group, type: "VARIABLE", hex };
        })));
        const assets = [...styleAssets, ...variableAssets];
        // Sort by Group then Name
        assets.sort((a, b) => {
            if (a.group < b.group)
                return -1;
            if (a.group > b.group)
                return 1;
            if (a.name < b.name)
                return -1;
            if (a.name > b.name)
                return 1;
            return 0;
        });
        figma.ui.postMessage({ type: 'color-assets', assets });
    });
}
function sendSelectionCount() {
    const selection = figma.currentPage.selection;
    const count = selection.length;
    figma.ui.postMessage({ type: 'selection-updated', count: count });
}
// Initial count and assets
// Initial count and assets
sendSelectionCount();
(() => __awaiter(void 0, void 0, void 0, function* () {
    yield getLocalColorAssets();
}))();
// Listen for selection changes
figma.on("selectionchange", sendSelectionCount);
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
    } : null;
}
figma.ui.onmessage = (msg) => __awaiter(void 0, void 0, void 0, function* () {
    if (msg.type === 'standardize-selection') {
        const selection = figma.currentPage.selection;
        if (selection.length === 0) {
            figma.notify("Select some icons to get started", { error: true });
            return;
        }
        const colorOptions = msg.colorOptions;
        let count = 0;
        const itemsToProcess = [];
        // Pre-process selection: Wrap Groups in Frames
        for (const node of selection) {
            if (node.type === "GROUP") {
                const frame = figma.createFrame();
                frame.name = node.name; // Keep name
                frame.x = node.x;
                frame.y = node.y;
                frame.resize(node.width, node.height);
                frame.fills = []; // Transparent
                // Insert frame at group's index in parent
                const parent = node.parent;
                if (parent) {
                    const index = parent.children.indexOf(node);
                    parent.insertChild(index, frame);
                }
                // Move group into frame
                frame.appendChild(node);
                node.x = 0;
                node.y = 0;
                itemsToProcess.push({ container: frame, originalGroup: node });
            }
            else if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
                itemsToProcess.push({ container: node });
            }
        }
        for (const item of itemsToProcess) {
            const node = item.container;
            // Type guard after filtering
            if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "COMPONENT_SET")
                continue;
            // Find all vector children
            const vectorNodes = node.findAll(n => n.type === "VECTOR" ||
                n.type === "STAR" ||
                n.type === "LINE" ||
                n.type === "ELLIPSE" ||
                n.type === "POLYGON" ||
                n.type === "BOOLEAN_OPERATION" ||
                n.type === "TEXT");
            if (vectorNodes.length > 0) {
                // Flatten them
                const flattened = figma.flatten(vectorNodes, node);
                // Rename
                flattened.name = "Vector";
                // Set constraints (SCALE preserves relative position/size)
                flattened.constraints = { horizontal: "SCALE", vertical: "SCALE" };
                // Apply Color Logic
                if (colorOptions && colorOptions.mode !== 'ORIGINAL') {
                    const val = colorOptions.value;
                    if (colorOptions.mode === 'HEX' && val) {
                        const rgb = hexToRgb(val);
                        if (rgb) {
                            flattened.fills = [{ type: 'SOLID', color: rgb }];
                        }
                    }
                    else if (colorOptions.mode === 'STYLE' && val) {
                        // Try Style first
                        const style = yield figma.getStyleByIdAsync(val);
                        if (style) {
                            flattened.fillStyleId = style.id;
                        }
                        else {
                            // Try Variable
                            try {
                                const variable = yield figma.variables.getVariableByIdAsync(val);
                                if (variable) {
                                    const currentFills = flattened.fills.length > 0 ? [...flattened.fills] : [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
                                    if (currentFills[0].type === "SOLID") {
                                        const newPaint = figma.variables.setBoundVariableForPaint(currentFills[0], 'color', variable);
                                        flattened.fills = [newPaint];
                                    }
                                }
                            }
                            catch (e) {
                                // console.error("Error applying variable", e);
                            }
                        }
                    }
                }
                // Cleanup: Remove original group if it exists
                if (item.originalGroup && !item.originalGroup.removed) {
                    item.originalGroup.remove();
                }
                // Fallback cleanup for any other empty groups
                const emptyGroups = node.findAll(n => n.type === "GROUP" && n.children.length === 0);
                for (const group of emptyGroups) {
                    group.remove();
                }
                count++;
            }
        }
        if (count > 0) {
            figma.notify(`Standardized ${count} ${count === 1 ? 'icon' : 'icons'} successfully!`, { timeout: 2000 });
        }
        else {
            // Only notify if we didn't exit early (which we do for 0 selection)
            // But if selection was >0 but no valid icons found:
            figma.notify("No standardizable icons found in selection.", { error: true });
        }
    }
});
