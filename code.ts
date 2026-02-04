
figma.showUI(__html__, { width: 240, height: 140 });

function sendSelectionCount() {
    const selection = figma.currentPage.selection;
    const count = selection.length;
    figma.ui.postMessage({ type: 'selection-updated', count: count });
}

// Initial count
sendSelectionCount();

// Listen for selection changes
figma.on("selectionchange", sendSelectionCount);

figma.ui.onmessage = msg => {
    if (msg.type === 'standardize-selection') {
        const selection = figma.currentPage.selection;
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
            } else if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
                itemsToProcess.push({ container: node });
            }
        }

        for (const item of itemsToProcess) {
            const node = item.container;
            // Type guard after filtering
            if (node.type !== "FRAME" && node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") continue;

            // Find all vector children
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
                // Flatten them
                const flattened = figma.flatten(vectorNodes, node);

                // Rename
                flattened.name = "Vector";

                // Set constraints (SCALE preserves relative position/size)
                flattened.constraints = { horizontal: "SCALE", vertical: "SCALE" };

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
            figma.notify(`Standardized ${count} icon${count === 1 ? '' : 's'}`);
        } else {
            figma.notify("No valid frames or components selected");
        }
    }
};
