figma.showUI(__html__, { width: 400, height: 600, themeColors: true });

function rgbToHex(r: number, g: number, b: number) {
    return "#" + ((1 << 24) + ((r * 255) | 0) * 65536 + ((g * 255) | 0) * 256 + ((b * 255) | 0)).toString(16).slice(1).toUpperCase();
}

async function resolveColorFromVariable(variable: Variable): Promise<string | null> {
    try {
        // Resolve for current context (first selection or page)
        const context = figma.currentPage.selection[0] || figma.currentPage;
        const { value } = variable.resolveForConsumer(context);

        if ((value as any).type === "VARIABLE_ALIAS") {
            const aliasId = (value as any).id;
            const aliasedVar = await figma.variables.getVariableByIdAsync(aliasId);
            if (aliasedVar) {
                return await resolveColorFromVariable(aliasedVar);
            }
        } else if (typeof value === "object" && "r" in (value as any)) {
            const { r, g, b } = value as RGB;
            return rgbToHex(r, g, b);
        }
    } catch (e) {
        // console.error("Failed to resolve variable", variable.name, e);
    }
    return null;
}

async function getLocalColorAssets() {
    const styles = await figma.getLocalPaintStylesAsync();
    const variables = await figma.variables.getLocalVariablesAsync("COLOR");

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

    const variableAssets = await Promise.all(variables.map(async v => {
        // For variables, we might not get a resolved color easily without context.
        // Use a placeholder or attempt basic resolution if possible, but keeping it simple/safe is better.
        const parts = v.name.split("/");
        const group = parts.length > 1 ? parts[0].trim() : "Other";
        const name = parts.length > 1 ? parts.slice(1).join("/").trim() : v.name;

        const hex = await resolveColorFromVariable(v);

        return { id: v.id, name, group, type: "VARIABLE", hex };
    }));

    const assets = [...styleAssets, ...variableAssets];

    // Sort by Group then Name
    assets.sort((a, b) => {
        if (a.group < b.group) return -1;
        if (a.group > b.group) return 1;
        if (a.name < b.name) return -1;
        if (a.name > b.name) return 1;
        return 0;
    });

    figma.ui.postMessage({ type: 'color-assets', assets });
}

async function getDimensionVariables() {
    try {
        // 1. Fetch all local number (FLOAT) variables
        const variables = await figma.variables.getLocalVariablesAsync('FLOAT');

        // 2. Define the context for resolving values (uses the first selected item or current page)
        const context = figma.currentPage.selection[0] || figma.currentPage;

        const resolvedAssets = variables
            .filter(v => {
                console.log(`Variable: ${v.name} | Scopes: ${v.scopes.join(', ') || 'All Scopes'}`);
                // Strict Filter: Only include if explicitly scoped to Width/Height or ALL_SCOPES
                return v.scopes.includes('WIDTH_HEIGHT') ||
                    v.scopes.includes('ALL_SCOPES');
            })
            .map(v => {
                // 3. Resolve the value for the current mode
                const { value } = v.resolveForConsumer(context);

                // Handle naming groups (e.g., "Sizes/Icon/Small" -> Group: "Sizes", Name: "Icon/Small")
                const parts = v.name.split('/');
                const group = parts.length > 1 ? parts[0] : 'General';
                const name = parts.length > 1 ? parts.slice(1).join('/') : v.name;

                return {
                    id: v.id,
                    name: name,
                    group: group,
                    // If the value is an alias, we provide a placeholder or resolve it further if needed
                    value: typeof value === 'number' ? value : 'Alias'
                };
            });

        console.log(`Backend: Found ${resolvedAssets.length} dimension variables.`);

        // 4. Send the cleaned data to the UI
        figma.ui.postMessage({
            type: 'dimension-variables',
            variables: resolvedAssets
        });

    } catch (err) {
        console.error("Failed to fetch dimension variables:", err);
    }
}

function sendSelectionCount() {
    const selection = figma.currentPage.selection;
    const count = selection.length;
    figma.ui.postMessage({ type: 'selection-updated', count: count });
}

// Initial count and assets
// Initial count and assets
sendSelectionCount();
(async () => {
    await getDimensionVariables();
    await getLocalColorAssets();
})();

// Listen for selection changes
figma.on("selectionchange", sendSelectionCount);

function hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255
    } : null;
}

figma.ui.onmessage = async msg => {
    if (msg.type === 'standardize-selection') {
        const selection = figma.currentPage.selection;

        if (selection.length === 0) {
            figma.notify("Select some icons to get started", { error: true });
            return;
        }

        const colorOptions = msg.colorOptions;
        let count = 0;



        const itemsToProcess: { container: SceneNode; originalGroup?: GroupNode }[] = [];

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
            } else if (node.type === "FRAME" || node.type === "COMPONENT") {
                itemsToProcess.push({ container: node });
            } else if (node.type === "COMPONENT_SET") {
                // Expand into individual Variants to avoid merging all vectors
                for (const variant of node.children) {
                    if (variant.type === "COMPONENT") {
                        itemsToProcess.push({ container: variant });
                    }
                }
            }
        }

        for (const item of itemsToProcess) {
            const node = item.container;
            // Type guard after filtering
            if (node.type !== "FRAME" && node.type !== "COMPONENT") continue;

            // Find all vector children (excluding RECTANGLEs — those are cleaned up separately)
            const vectorNodes: SceneNode[] = node.findAll(n =>
                n.type === "VECTOR" ||
                n.type === "STAR" ||
                n.type === "LINE" ||
                n.type === "ELLIPSE" ||
                n.type === "POLYGON" ||
                n.type === "BOOLEAN_OPERATION" ||
                n.type === "TEXT"
            );

            if (vectorNodes.length > 0) {
                // Outline strokes before flattening to ensure proper scaling
                const shouldOutline = msg.shouldOutline !== false; // Default true if undefined
                const nodesToFlatten: SceneNode[] = [];
                for (const vNode of vectorNodes) {
                    let nodeProcessed = false;

                    // Only run outline logic if requested
                    if (shouldOutline) {
                        // Check if node has strokes (handle figma.mixed for strokeWeight)
                        if (
                            'strokes' in vNode &&
                            vNode.strokes.length > 0 &&
                            'strokeWeight' in vNode &&
                            vNode.strokeWeight !== figma.mixed &&
                            vNode.strokeWeight > 0
                        ) {
                            try {
                                // Cast to any to access outlineStroke safely
                                const nodeWithOutline = vNode as unknown as { outlineStroke: () => SceneNode | null };
                                if (typeof nodeWithOutline.outlineStroke === 'function') {
                                    const outlined = nodeWithOutline.outlineStroke();
                                    if (outlined) {
                                        nodesToFlatten.push(outlined);
                                        // Remove the original stroked node to prevent duplicates
                                        vNode.remove();
                                        nodeProcessed = true;
                                    }
                                }
                            } catch (e) {
                                // Fallback if outlining fails
                            }
                        }
                    }

                    if (!nodeProcessed) {
                        nodesToFlatten.push(vNode);
                    }
                }

                // Calculate original bounding box before flattening
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const n of nodesToFlatten) {
                    minX = Math.min(minX, n.x);
                    minY = Math.min(minY, n.y);
                    maxX = Math.max(maxX, n.x + n.width);
                    maxY = Math.max(maxY, n.y + n.height);
                }
                const originalX = minX;
                const originalY = minY;

                // Flatten them
                const flattened = figma.flatten(nodesToFlatten, node);

                // Rename
                flattened.name = "Vector";

                // Restore original position
                flattened.x = originalX;
                flattened.y = originalY;

                // Set constraints AFTER position is restored (SCALE preserves relative position/size)
                flattened.constraints = { horizontal: "SCALE", vertical: "SCALE" };

                // Handle Resizing
                const shouldResize = msg.shouldResize;
                const targetSize = msg.targetSize;
                const targetSizeVariableId = msg.targetSizeVariableId;

                if (shouldResize) {
                    if (targetSizeVariableId) {
                        try {
                            // 1. Get the actual Variable object, not just the ID
                            const variable = await figma.variables.getVariableByIdAsync(targetSizeVariableId);

                            if (variable) {
                                // 2. Use the modern syntax: pass the variable object instead of the ID string
                                node.setBoundVariable('width', variable);
                                node.setBoundVariable('height', variable);

                                // 3. Resolve and force the physical resize
                                const { value } = variable.resolveForConsumer(node);

                                if (typeof value === 'number') {
                                    node.resize(value, value);
                                }

                                // 4. Lock aspect ratio
                                node.constrainProportions = true;
                            }
                        } catch (e) {
                            console.error("Failed to apply dimension variable", e);
                        }
                    } else if (targetSize && targetSize > 0) {
                        node.resize(targetSize, targetSize);
                        node.constrainProportions = true;
                    }
                }

                // Apply Color Logic
                if (colorOptions && colorOptions.mode !== 'ORIGINAL') {
                    const val = colorOptions.value;

                    // Determine which paint targets exist on the flattened node
                    const hasFills = Array.isArray(flattened.fills) && (flattened.fills as Paint[]).length > 0;
                    const hasStrokes = 'strokes' in flattened
                        && Array.isArray(flattened.strokes)
                        && (flattened.strokes as Paint[]).length > 0;

                    if (colorOptions.mode === 'HEX' && val) {
                        const rgb = hexToRgb(val);
                        if (rgb) {
                            const solidPaint: SolidPaint = { type: 'SOLID', color: rgb };
                            if (hasFills) {
                                flattened.fills = [solidPaint];
                            }
                            if (hasStrokes) {
                                flattened.strokes = [solidPaint];
                            }
                        }
                    } else if (colorOptions.mode === 'STYLE' && val) {
                        // Unified approach: Try Style first, fallback to Variable
                        const style = await figma.getStyleByIdAsync(val);

                        if (style) {
                            // It's a Style — apply to fills and/or strokes
                            if (hasFills) {
                                await flattened.setFillStyleIdAsync(style.id);
                            }
                            if (hasStrokes) {
                                await (flattened as any).setStrokeStyleIdAsync(style.id);
                            }
                        } else {
                            // Fallback: Try it as a Variable
                            const variable = await figma.variables.getVariableByIdAsync(val);
                            if (variable) {
                                // Apply to fills (only if fills exist)
                                if (hasFills) {
                                    const currentFills = [...(flattened.fills as Paint[])];
                                    if (currentFills[0].type === "SOLID") {
                                        const newPaint = figma.variables.setBoundVariableForPaint(
                                            currentFills[0] as SolidPaint,
                                            'color',
                                            variable
                                        );
                                        flattened.fills = [newPaint];
                                    }
                                }

                                // Apply to strokes
                                if (hasStrokes) {
                                    const currentStrokes = [...(flattened.strokes as Paint[])];
                                    if (currentStrokes[0].type === "SOLID") {
                                        const newStrokePaint = figma.variables.setBoundVariableForPaint(
                                            currentStrokes[0] as SolidPaint,
                                            'color',
                                            variable
                                        );
                                        flattened.strokes = [newStrokePaint];
                                    }
                                }
                            }
                        }
                    }
                }

                // Cleanup: Remove ALL remaining children except the flattened vector
                // This handles bounding boxes, original groups, leftover layers, etc.
                try {
                    const children = [...node.children];
                    for (const child of children) {
                        if (child.id !== flattened.id) {
                            try { child.remove(); } catch (e) { /* ignore */ }
                        }
                    }
                } catch (e) {
                    // Ignore cleanup errors
                }

                count++;
            }

        }

        if (count > 0) {
            figma.notify(`Simplified ${count} ${count === 1 ? 'icon' : 'icons'} successfully!`, { timeout: 2000 });
        } else {
            // Only notify if we didn't exit early (which we do for 0 selection)
            // But if selection was >0 but no valid icons found:
            figma.notify("No icons found in selection.", { error: true });
        }
    }
};
