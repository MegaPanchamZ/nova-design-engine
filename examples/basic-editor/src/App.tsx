import React, { useEffect, useState } from 'react';

import { createDefaultNode } from 'nova-design-engine';
import { NovaEditorShell, Viewer, useStore } from 'nova-design-engine/react';

const seedDocument = () => {
  const state = useStore.getState();
  const currentPage = state.pages.find((page) => page.id === state.currentPageId);
  if (!currentPage || currentPage.nodes.length > 0) return;

  const frame = createDefaultNode('frame', 120, 80);
  frame.name = 'Landing Card';
  frame.width = 520;
  frame.height = 360;
  frame.fill = '#0B1220';
  frame.fills = [{ id: 'frame-fill', type: 'solid', color: '#0B1220', opacity: 1, visible: true }];
  frame.cornerRadius = 28;

  const eyebrow = createDefaultNode('text', 36, 32);
  eyebrow.parentId = frame.id;
  eyebrow.text = 'Nova Prototype';
  eyebrow.fontSize = 18;
  eyebrow.fill = '#38BDF8';
  eyebrow.fills = [{ id: 'eyebrow-fill', type: 'solid', color: '#38BDF8', opacity: 1, visible: true }];

  const headline = createDefaultNode('text', 36, 74);
  headline.parentId = frame.id;
  headline.text = 'Design, iterate, and preview from one runtime.';
  headline.width = 360;
  headline.height = 120;
  headline.fontSize = 34;
  headline.lineHeight = 42;
  headline.fill = '#F8FAFC';
  headline.fills = [{ id: 'headline-fill', type: 'solid', color: '#F8FAFC', opacity: 1, visible: true }];

  const cta = createDefaultNode('rect', 36, 230);
  cta.parentId = frame.id;
  cta.name = 'CTA';
  cta.width = 180;
  cta.height = 52;
  cta.cornerRadius = 18;
  cta.fill = '#14B8A6';
  cta.fills = [{ id: 'cta-fill', type: 'solid', color: '#14B8A6', opacity: 1, visible: true }];
  cta.interactions = [
    {
      id: 'toggle-details',
      trigger: 'onClick',
      actions: [{ type: 'toggleVisibility', targetId: 'details-copy', value: true }],
    },
  ];

  const ctaLabel = createDefaultNode('text', 54, 244);
  ctaLabel.parentId = frame.id;
  ctaLabel.text = 'Toggle details';
  ctaLabel.fontSize = 18;
  ctaLabel.fill = '#042F2E';
  ctaLabel.fills = [{ id: 'cta-label-fill', type: 'solid', color: '#042F2E', opacity: 1, visible: true }];

  const details = createDefaultNode('text', 36, 300);
  details.id = 'details-copy';
  details.parentId = frame.id;
  details.text = 'Prototype mode executes node interactions. Click the CTA in Viewer to toggle this copy.';
  details.width = 420;
  details.height = 60;
  details.fontSize = 16;
  details.lineHeight = 24;
  details.fill = '#CBD5E1';
  details.fills = [{ id: 'details-fill', type: 'solid', color: '#CBD5E1', opacity: 1, visible: true }];
  details.visible = false;

  const pages = state.pages.map((page) => (
    page.id === state.currentPageId
      ? { ...page, nodes: [frame, eyebrow, headline, cta, ctaLabel, details] }
      : page
  ));

  useStore.setState({ pages, selectedIds: [frame.id] });
  useStore.getState().pushHistory('seed');
};

export default function App() {
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    seedDocument();
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#050816' }}>
      <div
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          zIndex: 200,
          display: 'flex',
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={() => setPreview((current) => !current)}
          style={{
            border: '1px solid #1f2937',
            background: preview ? '#14b8a6' : '#111827',
            color: preview ? '#042f2e' : '#e5e7eb',
            borderRadius: 999,
            padding: '10px 14px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {preview ? 'Back to editor' : 'Open viewer'}
        </button>
      </div>

      {preview ? (
        <Viewer accentColor="#14b8a6" canvasBackgroundColor="#050816" style={{ minHeight: '100vh' }} />
      ) : (
        <NovaEditorShell showChat={false} accentColor="#14b8a6" canvasBackgroundColor="#050816" />
      )}
    </div>
  );
}