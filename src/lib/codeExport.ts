import { SceneNode } from '../types';
import { exportNodesToCss } from './cssExport';

export const exportToCss = (nodes: SceneNode[]): string => {
    return exportNodesToCss(nodes).css;
};

export const exportToCode = (nodes: SceneNode[]): string => {
    const { css, html } = exportNodesToCss(nodes);
    const escapedCss = css
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$\{/g, '\\${');

    return `import React from 'react';

const styles = \`${escapedCss}\`;

export const GeneratedComponent = () => {
    return (
        <>
            <style>{styles}</style>
            <div dangerouslySetInnerHTML={{ __html: ${JSON.stringify(html)} }} />
        </>
    );
};
`;
};
