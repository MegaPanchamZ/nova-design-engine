import React, { useRef, useEffect } from 'react';
import { useStore } from '../store';

export const FigmaRulers = () => {
    const { viewport, showRulers, addGuide } = useStore();
    const horizontalRef = useRef<HTMLDivElement>(null);
    const verticalRef = useRef<HTMLDivElement>(null);

    if (!showRulers) return null;

    const zoom = viewport.zoom;
    const step = 100 * zoom;
    const subStep = 10 * zoom;

    const renderTicks = (type: 'horizontal' | 'vertical') => {
        const size = type === 'horizontal' ? window.innerWidth : window.innerHeight;
        const offset = type === 'horizontal' ? viewport.x : viewport.y;
        const ticks = [];

        const start = Math.floor(-offset / zoom / 100) * 100;
        const end = Math.ceil((size - offset) / zoom / 100) * 100;

        for (let i = start; i <= end; i += 100) {
            const pos = i * zoom + offset;
            ticks.push(
                <div 
                    key={i} 
                    className="absolute flex items-end justify-center"
                    style={{
                        [type === 'horizontal' ? 'left' : 'top']: pos,
                        [type === 'horizontal' ? 'width' : 'height']: 1,
                        [type === 'horizontal' ? 'height' : 'width']: '100%',
                    }}
                >
                    <span className={`text-[9px] text-[#A1A1A1] ${type === 'horizontal' ? 'mb-1' : '-rotate-90 ml-1'}`}>
                        {i}
                    </span>
                    <div className={`${type === 'horizontal' ? 'h-full w-[1px]' : 'w-full h-[1px]'} bg-[#444]`} />
                </div>
            );
            
            // Subticks
            for (let j = 10; j < 100; j += 10) {
                const subPos = (i + j) * zoom + offset;
                if (subPos > size) break;
                ticks.push(
                    <div 
                        key={`${i}-${j}`} 
                        className="absolute bg-[#333]"
                        style={{
                            [type === 'horizontal' ? 'left' : 'top']: subPos,
                            [type === 'horizontal' ? 'width' : 'height']: 1,
                            [type === 'horizontal' ? 'height' : 'width']: j === 50 ? '50%' : '25%',
                            [type === 'horizontal' ? 'bottom' : 'right']: 0
                        }}
                    />
                );
            }
        }
        return ticks;
    };

    const handleRulerClick = (type: 'horizontal' | 'vertical', e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const mousePos = type === 'horizontal' ? e.clientX - rect.left : e.clientY - rect.top;
        const canvasPos = (mousePos - (type === 'horizontal' ? viewport.x : viewport.y)) / zoom;
        // addGuide(type, canvasPos); // Actually we should drag to add guide
    };

    return (
        <>
            {/* Corner block */}
            <div className="absolute top-0 left-0 w-5 h-5 bg-[#222] border-r border-b border-[#333] z-[60]" />
            
            {/* Horizontal Ruler */}
            <div 
                ref={horizontalRef}
                className="absolute top-0 left-5 right-0 h-5 bg-[#222] border-b border-[#333] z-[60] overflow-hidden cursor-ns-resize"
                onMouseDown={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const initialY = e.clientY;
                    const onMouseMove = (moveEvent: MouseEvent) => {
                       // Logic to show a phantom line
                    };
                    const onMouseUp = (upEvent: MouseEvent) => {
                        const rulerRect = e.currentTarget.getBoundingClientRect();
                        const canvasY = (upEvent.clientY - rulerRect.bottom - viewport.y) / zoom; 
                        addGuide('horizontal', canvasY);
                        window.removeEventListener('mousemove', onMouseMove);
                        window.removeEventListener('mouseup', onMouseUp);
                    };
                    window.addEventListener('mousemove', onMouseMove);
                    window.addEventListener('mouseup', onMouseUp);
                }}
            >
                {renderTicks('horizontal')}
            </div>

            {/* Vertical Ruler */}
            <div 
                ref={verticalRef}
                className="absolute top-5 left-0 bottom-0 w-5 bg-[#222] border-r border-[#333] z-[60] overflow-hidden cursor-ew-resize"
                onMouseDown={(e) => {
                    const onMouseUp = (upEvent: MouseEvent) => {
                        const rulerRect = e.currentTarget.getBoundingClientRect();
                        const canvasX = (upEvent.clientX - rulerRect.right - viewport.x) / zoom;
                        addGuide('vertical', canvasX);
                        window.removeEventListener('mouseup', onMouseUp);
                    };
                    window.addEventListener('mouseup', onMouseUp);
                }}
            >
                {renderTicks('vertical')}
            </div>
        </>
    );
};
