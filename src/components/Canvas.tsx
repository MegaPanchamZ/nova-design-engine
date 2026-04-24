import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Rect, Circle, Ellipse, Text, Path, Line, Group, Transformer } from 'react-konva';
import useImage from 'use-image';
import { useStore } from '../store';
import { createDefaultNode, SceneNode, TextNode } from '../types';
import Konva from 'konva';
import { measureText } from '../lib/measureText';
import { getSuperellipsePath } from '../lib/geometry';
import { FigmaRulers } from './Rulers';

const KonvaImage = ({ node, konvaProps, selectionProps, hoverProps, viewport }: any) => {
    const [img] = useImage(node.src, 'anonymous');
    
    const getScaleProps = () => {
        if (!img) return {};
        
        const mode = node.imageScaleMode || 'fill';
        const nodeWidth = node.width;
        const nodeHeight = node.height;
        const imgWidth = img.width;
        const imgHeight = img.height;
        
        let scale = 1;
        let offsetX = 0;
        let offsetY = 0;
        let repeat = 'no-repeat';

        if (mode === 'fill') {
            scale = Math.max(nodeWidth / imgWidth, nodeHeight / imgHeight);
            offsetX = (imgWidth * scale - nodeWidth) / 2 / scale;
            offsetY = (imgHeight * scale - nodeHeight) / 2 / scale;
        } else if (mode === 'fit') {
            scale = Math.min(nodeWidth / imgWidth, nodeHeight / imgHeight);
            offsetX = (imgWidth * scale - nodeWidth) / 2 / scale;
            offsetY = (imgHeight * scale - nodeHeight) / 2 / scale;
        } else if (mode === 'tile') {
            scale = node.imageScale || 1;
            repeat = 'repeat';
        } else {
            // Stretch (default / old behavior)
            return {
                fillPatternImage: img,
                fillPatternScaleX: nodeWidth / imgWidth,
                fillPatternScaleY: nodeHeight / imgHeight,
                fillPatternRepeat: 'no-repeat'
            };
        }

        return {
            fillPatternImage: img,
            fillPatternScaleX: scale,
            fillPatternScaleY: scale,
            fillPatternOffset: { x: offsetX, y: offsetY },
            fillPatternRepeat: repeat
        };
    };

    const imageProps = getScaleProps();

    return (
        <Group>
            <Rect 
                {...konvaProps}
                {...imageProps}
                fill={!img ? '#E5E7EB' : undefined}
                lineJoin="round"
                cornerRadius={node.individualCornerRadius ? [
                    node.individualCornerRadius.topLeft,
                    node.individualCornerRadius.topRight,
                    node.individualCornerRadius.bottomRight,
                    node.individualCornerRadius.bottomLeft
                ] : node.cornerRadius}
            />
             {selectionProps && (
                <Rect 
                    x={node.x} y={node.y} width={node.width} height={node.height}
                    rotation={node.rotation}
                    cornerRadius={node.individualCornerRadius ? [
                        node.individualCornerRadius.topLeft,
                        node.individualCornerRadius.topRight,
                        node.individualCornerRadius.bottomRight,
                        node.individualCornerRadius.bottomLeft
                    ] : node.cornerRadius}
                    {...selectionProps}
                />
            )}
            {hoverProps && (
                <Rect 
                    x={node.x} y={node.y} width={node.width} height={node.height}
                    rotation={node.rotation}
                    cornerRadius={node.individualCornerRadius ? [
                        node.individualCornerRadius.topLeft,
                        node.individualCornerRadius.topRight,
                        node.individualCornerRadius.bottomRight,
                        node.individualCornerRadius.bottomLeft
                    ] : node.cornerRadius}
                    {...hoverProps}
                />
            )}
        </Group>
    );
};

export const Canvas = () => {
  const { 
    pages, currentPageId, selectedIds, viewport, tool, setViewport, 
    addNode, updateNode, setSelectedIds, pushHistory, mode, hoveredId 
  } = useStore();
  
  const currentPage = pages.find(p => p.id === currentPageId);
  const nodes = currentPage?.nodes || [];
  
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [isDrawing, setIsDrawing] = useState(false);
  const [newNode, setNewNode] = useState<SceneNode | null>(null);
  
  // Selection Marquee
  const [selectionRect, setSelectionRect] = useState<{ x: number, y: number, width: number, height: number } | null>(null);
  
  // Text Editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingHeight, setEditingHeight] = useState<number | null>(null);

  // Pen Tool
  const [penPoints, setPenPoints] = useState<{ x: number, y: number, cp1?: {x: number, y: number}, cp2?: {x: number, y: number} }[]>([]);
  const [isPenDragging, setIsPenDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  // Redlines
  const [altHeld, setAltHeld] = useState(false);

  useEffect(() => {
    if (stageRef.current) {
        (window as any).canvasStage = stageRef.current;
    }
  }, [stageRef.current]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Alt') setAltHeld(true);
        if (e.key === '.' || e.key === 'Decimal') {
            zoomToFitSelected();
        }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Alt') setAltHeld(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Tool Tool Handlers
  const [draggedPointIndex, setDraggedPointIndex] = useState<{ nodeId: string, index: number } | null>(null);

  const zoomToFitSelected = () => {
    if (selectedIds.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    selectedIds.forEach(id => {
      const node = nodes.find(n => n.id === id);
      if (node) {
        const pos = getGlobalPosition(id);
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + node.width);
        maxY = Math.max(maxY, pos.y + node.height);
      }
    });

    if (minX === Infinity) return;

    const width = maxX - minX;
    const height = maxY - minY;
    const padding = 100;

    const container = document.getElementById('canvas-container');
    if (!container) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;

    const zoom = Math.min((cw - padding * 2) / width, (ch - padding * 2) / height);
    const finalZoom = Math.max(0.05, Math.min(zoom, 8)); // Clamp zoom

    const newX = (cw / 2) - (minX + width / 2) * finalZoom;
    const newY = (ch / 2) - (minY + height / 2) * finalZoom;

    setViewport({ x: newX, y: newY, zoom: finalZoom });
  };

  const handlePointDragMove = (nodeId: string, index: number, e: any) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node && node.type === 'path') {
        const { x, y } = getPointerPosition();
        // This is a bit complex because we need to parse the path data
        // For now, let's assume simple L points
        const points = (node as any).data.replace(/[MLZ]/g, '').trim().split(/\s+/).map(Number);
        const newPoints = [...points];
        newPoints[index * 2] = x - node.x;
        newPoints[index * 2 + 1] = y - node.y;
        
        let newData = '';
        for (let i = 0; i < newPoints.length; i += 2) {
            newData += (i === 0 ? 'M ' : 'L ') + `${newPoints[i]} ${newPoints[i+1]} `;
        }
        if ((node as any).data.includes('Z')) newData += 'Z';
        
        updateNode(nodeId, { data: newData });
    }
  };

  // Handle selection Transformer
  useEffect(() => {
    if (transformerRef.current && stageRef.current) {
      if (editingId || penPoints.length > 0) {
        transformerRef.current.nodes([]);
        return;
      }
      const selectedNodes = selectedIds
        .map(id => stageRef.current?.findOne('#' + id))
        .filter(node => node !== undefined) as Konva.Node[];
      
      transformerRef.current.nodes(selectedNodes);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedIds, nodes, editingId]);

  const getPointerPosition = () => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    const pointer = stage.getPointerPosition();
    if (!pointer) return { x: 0, y: 0 };
    
    return {
      x: (pointer.x - viewport.x) / viewport.zoom,
      y: (pointer.y - viewport.y) / viewport.zoom,
    };
  };

  const getGlobalPosition = (nodeId: string): { x: number, y: number } => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    if (!node.parentId) return { x: node.x, y: node.y };
    const parentPos = getGlobalPosition(node.parentId);
    return { x: parentPos.x + node.x, y: parentPos.y + node.y };
  };

  const findInnermostFrame = (x: number, y: number, excludeIds: string[] = []): string | undefined => {
    const frames = nodes.filter(n => {
      if (n.type !== 'frame' || excludeIds.includes(n.id)) return false;
      const globalPos = getGlobalPosition(n.id);
      return x >= globalPos.x && x <= globalPos.x + n.width &&
             y >= globalPos.y && y <= globalPos.y + n.height;
    });

    if (frames.length === 0) return undefined;
    // Smallest area usually means most nested frame
    return frames.sort((a, b) => (a.width * a.height) - (b.width * b.height))[0].id;
  };

  const finalizePenPath = (closed: boolean = false) => {
    if (penPoints.length < 2) {
      setPenPoints([]);
      return;
    }
    
    // Find bounding box for the path
    const xs = penPoints.map(p => p.x);
    const ys = penPoints.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);

    // Normalize coordinates so node x,y is at top-left
    let data = `M ${penPoints[0].x - minX} ${penPoints[0].y - minY}`;
    for (let i = 1; i < penPoints.length; i++) {
        const prev = penPoints[i - 1];
        const curr = penPoints[i];
        if (prev.cp2 && curr.cp1) {
            data += ` C ${prev.cp2.x - minX} ${prev.cp2.y - minY}, ${curr.cp1.x - minX} ${curr.cp1.y - minY}, ${curr.x - minX} ${curr.y - minY}`;
        } else {
            data += ` L ${curr.x - minX} ${curr.y - minY}`;
        }
    }
    if (closed) data += ' Z';

    const node = createDefaultNode('path', minX, minY) as any;
    node.data = data;
    node.width = Math.max(1, maxX - minX);
    node.height = Math.max(1, maxY - minY);
    node.strokeWidth = 2;
    node.stroke = '#6366F1';
    addNode(node);
    setPenPoints([]);
    pushHistory();
  };

  const handleMouseDown = (e: any) => {
    // Middle Mouse Button (button 1) for panning
    if (e.evt.button === 1 || tool === 'hand') {
      setIsPanning(true);
      const stage = stageRef.current;
      if (stage) {
        stage.container().style.cursor = 'grabbing';
      }
      return;
    }

    // Stop editing if clicking elsewhere
    if (editingId) {
      updateNode(editingId, { text: editingText });
      pushHistory();
      setEditingId(null);
    }

    const clickedOnStage = e.target === e.target.getStage();
    const isDrawingTool = ['rect', 'circle', 'ellipse', 'text', 'frame', 'image'].includes(tool);

    // If text tool and clicked on existing text, edit it instead of creating new
    if (tool === 'text' && !clickedOnStage) {
        const id = e.target.id();
        const node = nodes.find(n => n.id === id);
        if (node?.type === 'text') {
            handleTextDblClick(node);
            return;
        }
    }
    if (clickedOnStage || isDrawingTool || tool === 'pen' || tool === 'select') {
      if (isDrawingTool) {
        const { x, y } = getPointerPosition();
        const parentId = findInnermostFrame(x, y);
        let finalX = x;
        let finalY = y;
        
        if (parentId) {
            const parentPos = getGlobalPosition(parentId);
            finalX -= parentPos.x;
            finalY -= parentPos.y;
        }

        const node = createDefaultNode(tool as any, finalX, finalY);
        node.parentId = parentId;
        node.width = 0;
        node.height = 0;
        setNewNode(node);
        setIsDrawing(true);
        setSelectedIds([]);
      } else if (tool === 'pen') {
        const { x, y } = getPointerPosition();
        
        // If clicking near first point, close it
        if (penPoints.length > 2) {
            const first = penPoints[0];
            const dist = Math.sqrt(Math.pow(x - first.x, 2) + Math.pow(y - first.y, 2));
            if (dist < 10 / viewport.zoom) {
                finalizePenPath(true);
                return;
            }
        }
        
        setIsPenDragging(true);
        setPenPoints([...penPoints, { x, y, cp1: {x, y}, cp2: {x, y} }]);
      } else if (tool === 'select') {
        const id = e.target.id();
        const clickedFrame = nodes.find(n => n.id === id && n.type === 'frame');
        
        if (clickedOnStage || clickedFrame) {
            const { x, y } = getPointerPosition();
            setSelectionRect({ x, y, width: 0, height: 0 });
            setSelectedIds([]);
        }
      }
      return;
    }
  };

  const handleMouseMove = (e: any) => {
    const stage = stageRef.current;
    if (!stage) return;

    if (isPanning) {
        const dx = e.evt.movementX;
        const dy = e.evt.movementY;
        setViewport({
            ...viewport,
            x: viewport.x + dx,
            y: viewport.y + dy
        });
        return;
    }

    if (tool === 'pen' && isPenDragging) {
        const { x, y } = getPointerPosition();
        const newPoints = [...penPoints];
        const last = newPoints[newPoints.length - 1];
        // Mirror the control points around the anchor point
        const dx = x - last.x;
        const dy = y - last.y;
        last.cp1 = { x: last.x - dx, y: last.y - dy };
        last.cp2 = { x: last.x + dx, y: last.y + dy };
        setPenPoints(newPoints);
        return;
    }

    if (isDrawing && newNode) {
      const stage = e.target.getStage();
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const scale = stage.scaleX();
      const x = (pointer.x - stage.x()) / scale;
      const y = (pointer.y - stage.y()) / scale;

      let localX = x;
      let localY = y;

      if (newNode.parentId) {
          const parentPos = getGlobalPosition(newNode.parentId);
          localX -= parentPos.x;
          localY -= parentPos.y;
      }

      if (newNode.type === 'ellipse') {
          setNewNode({
              ...newNode,
              width: Math.abs(localX - newNode.x) * 2,
              height: Math.abs(localY - newNode.y) * 2
          });
      } else if (newNode.type === 'text') {
          const w = localX - newNode.x;
          const h = localY - newNode.y;
          setNewNode({
              ...newNode,
              width: w,
              height: h,
              fontSize: Math.max(12, Math.abs(Math.floor(h / 1.2))) // Heuristic: font size is ~80% of box height
          });
      } else {
          setNewNode({
            ...newNode,
            width: localX - newNode.x,
            height: localY - newNode.y
          });
      }
    } else if (selectionRect) {
      const { x, y } = getPointerPosition();
      setSelectionRect({
        ...selectionRect,
        width: x - selectionRect.x,
        height: y - selectionRect.y
      });
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
        setIsPanning(false);
        const stage = stageRef.current;
        if (stage) {
            stage.container().style.cursor = tool === 'hand' ? 'grab' : 'crosshair';
        }
    }
    if (isPenDragging) {
        setIsPenDragging(false);
    }

    if (isDrawing && newNode) {
      const isDrag = Math.abs(newNode.width) > 5 || Math.abs(newNode.height) > 5;
      
      if (isDrag || newNode.type === 'text' || newNode.type === 'image') {
        const finalNode = { ...newNode };
        if (finalNode.width < 0) { finalNode.x += finalNode.width; finalNode.width = Math.abs(finalNode.width); }
        if (finalNode.height < 0) { finalNode.y += finalNode.height; finalNode.height = Math.abs(finalNode.height); }
        
        if (finalNode.type === 'text' || finalNode.type === 'image') {
            if (isDrag) {
              finalNode.horizontalResizing = 'fixed';
              finalNode.verticalResizing = finalNode.type === 'text' ? 'hug' : 'fixed';
            } else {
              finalNode.width = 100; // Default min width for click
              finalNode.height = finalNode.type === 'image' ? 100 : 24;
              if (finalNode.type === 'text') (finalNode as any).fontSize = 20; // Default for point text click
              finalNode.horizontalResizing = 'hug';
              finalNode.verticalResizing = 'hug';
            }
            if (finalNode.type === 'image') {
              (finalNode as any).src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60';
              (finalNode as any).imageScaleMode = 'fill';
            }
        } else {
            finalNode.width = Math.max(finalNode.width, 20);
            finalNode.height = Math.max(finalNode.height, 20);
        }
        
        addNode(finalNode);
        pushHistory();
      }
      setIsDrawing(false);
      setNewNode(null);
    } else if (selectionRect) {
      // Perform marquee selection
      const box = {
        x: selectionRect.width < 0 ? selectionRect.x + selectionRect.width : selectionRect.x,
        y: selectionRect.height < 0 ? selectionRect.y + selectionRect.height : selectionRect.y,
        width: Math.abs(selectionRect.width),
        height: Math.abs(selectionRect.height)
      };

      const hits = nodes.filter(node => {
        const globalPos = getGlobalPosition(node.id);
        const nodeX = globalPos.x;
        const nodeY = globalPos.y;
        const nodeRight = nodeX + node.width;
        const nodeBottom = nodeY + node.height;
        const boxRight = box.x + box.width;
        const boxBottom = box.y + box.height;
        
        // Classic AABB intersection in global coordinates
        return (
            nodeX < boxRight &&
            nodeRight > box.x &&
            nodeY < boxBottom &&
            nodeBottom > box.y
        );
      }).map(n => n.id);

      setSelectedIds(hits);
      setSelectionRect(null);
    }
  };

  const handleTextDblClick = (node: SceneNode) => {
    if (node.type === 'text') {
      setEditingId(node.id);
      setEditingText(node.text);
      setEditingHeight(node.height);
      setSelectedIds([]);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setEditingText(newText);
    
    if (editingId) {
        const node = nodes.find(n => n.id === editingId);
        if (node && node.type === 'text') {
            const textNode = node as TextNode;
            const maxWidth = (textNode.horizontalResizing === 'fixed' || textNode.horizontalResizing === 'fill') ? textNode.width : undefined;
            const metrics = measureText(newText, textNode.fontSize, textNode.fontFamily, maxWidth, textNode.lineHeight);
            setEditingHeight(metrics.height);
        }
    }
  };

  const handleTextKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      updateNode(editingId!, { text: editingText });
      pushHistory();
      setEditingId(null);
      setEditingHeight(null);
    }
    if (e.key === 'Escape') {
      setEditingId(null);
      setEditingHeight(null);
    }
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const scaleBy = 1.1;
    const oldScale = viewport.zoom;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - viewport.x) / oldScale,
      y: (pointer.y - viewport.y) / oldScale,
    };

    let newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
    newScale = Math.min(Math.max(newScale, 0.05), 20); // Limit zoom

    setViewport({
      zoom: newScale,
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const handleNodeDragStart = (e: any) => {
    const id = e.target.id();
    if (!selectedIds.includes(id)) {
      setSelectedIds([id]);
    }
  };

  // Smart Snapping
  const [guides, setGuides] = useState<{ x?: number, y?: number }[]>([]);

  const handleNodeDragMove = (e: any) => {
    const node = e.target;
    const stage = stageRef.current;
    if (!stage) return;

    const snapThreshold = 5 / viewport.zoom;
    const newGuides: { x?: number, y?: number }[] = [];
    
    let currentX = node.x();
    let currentY = node.y();

    nodes.forEach(otherNode => {
      if (otherNode.id === node.id()) return;

      // Snap X
      if (Math.abs(currentX - otherNode.x) < snapThreshold) {
        currentX = otherNode.x;
        newGuides.push({ x: otherNode.x });
      }
      if (Math.abs(currentX + node.width() - (otherNode.x + otherNode.width)) < snapThreshold) {
        currentX = otherNode.x + otherNode.width - node.width();
        newGuides.push({ x: otherNode.x + otherNode.width });
      }

      // Snap Y
      if (Math.abs(currentY - otherNode.y) < snapThreshold) {
        currentY = otherNode.y;
        newGuides.push({ y: otherNode.y });
      }
      if (Math.abs(currentY + node.height() - (otherNode.y + otherNode.height)) < snapThreshold) {
        currentY = otherNode.y + otherNode.height - node.height();
        newGuides.push({ y: otherNode.y + otherNode.height });
      }
    });

    node.x(currentX);
    node.y(currentY);
    setGuides(newGuides);
  };

  const handleNodeUpdate = (e: any) => {
    const konvaNode = e.target;
    const nodeId = konvaNode.id();
    const nodeData = nodes.find(n => n.id === nodeId);
    if (!nodeData) return;

    // Get stage-relative position and convert to canvas-global
    const absolutePos = konvaNode.getAbsolutePosition();
    const globalX = (absolutePos.x - viewport.x) / viewport.zoom;
    const globalY = (absolutePos.y - viewport.y) / viewport.zoom;

    // We want to reparent based on where the node is dropped
    // Exclude self and children to avoid circular dependency
    const getDescendants = (id: string): string[] => {
      const children = nodes.filter(n => n.parentId === id);
      return [id, ...children.flatMap(c => getDescendants(c.id))];
    };
    const excluded = getDescendants(nodeId);
    
    // Use center of node for reparenting detection
    const newParentId = findInnermostFrame(
        globalX + (konvaNode.width() * konvaNode.scaleX()) / 2, 
        globalY + (konvaNode.height() * konvaNode.scaleY()) / 2, 
        excluded
    );

    let finalX = globalX;
    let finalY = globalY;

    if (newParentId) {
        const parentPos = getGlobalPosition(newParentId);
        finalX -= parentPos.x;
        finalY -= parentPos.y;
    }

    const newWidth = konvaNode.width() * konvaNode.scaleX();
    const newHeight = konvaNode.height() * konvaNode.scaleY();
    const wasResized = Math.abs(newWidth - nodeData.width) > 0.1 || Math.abs(newHeight - nodeData.height) > 0.1;

    updateNode(nodeId, {
      x: finalX,
      y: finalY,
      parentId: newParentId,
      width: newWidth,
      height: newHeight,
      rotation: konvaNode.rotation(),
      scaleX: 1,
      scaleY: 1,
      ...(wasResized ? { 
          horizontalResizing: 'fixed', 
          verticalResizing: 'fixed' 
      } : {})
    });
    setGuides([]);
    pushHistory();
  };

  const renderSingleNode = (node: SceneNode) => {
    const isSelected = selectedIds.includes(node.id);
    const getPaintProps = (paints: any[] | undefined, fallback: string) => {
      if (!paints || paints.length === 0) return { fill: fallback };
      const visible = paints.filter(p => p.visible !== false);
      if (visible.length === 0) return { fill: 'transparent' };
      
      const paint = visible[visible.length - 1];
      if (paint.type === 'solid') {
        return { fill: paint.color, opacity: (node.opacity || 1) * (paint.opacity || 1) };
      } else if (paint.type === 'gradient-linear') {
        const stops: any[] = [];
        (paint.gradientStops || []).forEach((s: any) => {
          stops.push(s.offset, s.color);
        });
        return {
          fillLinearGradientStartPoint: { x: 0, y: 0 },
          fillLinearGradientEndPoint: { x: node.width, y: 0 },
          fillLinearGradientColorStops: stops,
          opacity: (node.opacity || 1) * (paint.opacity || 1)
        };
      }
      return { fill: paint.color || fallback };
    };

    const fillProps = getPaintProps(node.fills, node.fill);
    const strokeProps = getPaintProps(node.strokes, node.stroke);
    const cornerRadiusArray = node.individualCornerRadius ? [
        node.individualCornerRadius.topLeft,
        node.individualCornerRadius.topRight,
        node.individualCornerRadius.bottomRight,
        node.individualCornerRadius.bottomLeft
    ] : node.cornerRadius;

    // Effects
    const dropShadow = (node.effects || []).find((e: any) => e.visible !== false && e.type === 'drop-shadow');
    const shadowProps = dropShadow ? {
        shadowColor: dropShadow.color,
        shadowBlur: dropShadow.radius,
        shadowOffset: dropShadow.offset,
        shadowOpacity: 1,
    } : {};

    const layerBlur = (node.effects || []).find((e: any) => e.visible !== false && e.type === 'layer-blur');
    const blurProps = layerBlur ? {
        filters: [Konva.Filters.Blur],
        blurRadius: layerBlur.radius,
    } : {};

    const { key: _key, ...konvaProps } = {
      id: node.id,
      key: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      rotation: node.rotation,
      opacity: node.opacity,
      draggable: node.draggable && !node.locked && tool === 'select' && !isPanning,
      listening: node.visible,
      ...fillProps,
      stroke: strokeProps.fill,
      strokeWidth: node.strokeWidth,
      cornerRadius: cornerRadiusArray,
      ...shadowProps,
      ...blurProps,
      onDragMove: handleNodeDragMove,
      onDragStart: handleNodeDragStart,
      onDragEnd: handleNodeUpdate,
      onTransformEnd: handleNodeUpdate,
      onTransform: (e: any) => {
          const nodeTarget = e.target;
          const scaleX = nodeTarget.scaleX();
          const scaleY = nodeTarget.scaleY();
          nodeTarget.setAttrs({
            width: Math.max(5, nodeTarget.width() * scaleX),
            height: Math.max(5, nodeTarget.height() * scaleY),
            scaleX: 1,
            scaleY: 1
          });
      },
      onClick: (e: any) => {
        if (node.locked) return;
        e.cancelBubble = true;
        if (e.evt.shiftKey) {
          setSelectedIds([...selectedIds, node.id]);
        } else {
          setSelectedIds([node.id]);
        }
      },
      onDblClick: () => handleTextDblClick(node),
      onMouseEnter: () => useStore.getState().setHoveredId(node.id),
      onMouseLeave: () => useStore.getState().setHoveredId(null),
    };

    const isComponentRelated = node.type === 'component' || node.type === 'instance';
    const selectionColor = isComponentRelated ? '#A855F7' : '#6366F1';
    
    const selectionProps = isSelected ? {
        stroke: selectionColor,
        strokeWidth: 2 / viewport.zoom,
        dash: node.type === 'instance' ? [4 / viewport.zoom, 2 / viewport.zoom] : undefined,
        listening: false,
    } : null;

    const isHovered = useStore.getState().hoveredId === node.id && !isSelected;
    const hoverProps = isHovered ? {
        stroke: selectionColor,
        strokeWidth: 1 / viewport.zoom,
        listening: false,
        opacity: 0.5
    } : null;

    if (node.type === 'frame') {
        const hasSmoothing = node.cornerSmoothing > 0;
        const isTopLevel = !node.parentId;
        
        return (
            <Group key={node.id}>
                {isTopLevel && (
                    <Text 
                        x={node.x}
                        y={node.y - (14 / viewport.zoom)}
                        text={node.name}
                        fontSize={11 / viewport.zoom}
                        fontFamily="Inter"
                        fill={isSelected ? selectionColor : "#A1A1A1"}
                        fontStyle="600"
                    />
                )}
                <Group 
                    {...konvaProps} 
                    name="frame"
                    clipFunc={node.clipsContent ? (ctx) => {
                        const r = node.individualCornerRadius || { topLeft: node.cornerRadius || 0, topRight: node.cornerRadius || 0, bottomRight: node.cornerRadius || 0, bottomLeft: node.cornerRadius || 0 };
                        const w = node.width;
                        const h = node.height;
                        ctx.beginPath();
                        ctx.moveTo(r.topLeft, 0);
                        ctx.lineTo(w - r.topRight, 0);
                        ctx.quadraticCurveTo(w, 0, w, r.topRight);
                        ctx.lineTo(w, h - r.bottomRight);
                        ctx.quadraticCurveTo(w, h, w - r.bottomRight, h);
                        ctx.lineTo(r.bottomLeft, h);
                        ctx.quadraticCurveTo(0, h, 0, h - r.bottomLeft);
                        ctx.lineTo(0, r.topLeft);
                        ctx.quadraticCurveTo(0, 0, r.topLeft, 0);
                        ctx.closePath();
                    } : undefined}
                >
                    {hasSmoothing ? (
                        <Path 
                            data={getSuperellipsePath(node.width, node.height, node.cornerRadius, node.cornerSmoothing)}
                            {...fillProps}
                            stroke={strokeProps.fill}
                            strokeWidth={node.strokeWidth}
                        />
                    ) : (
                        <Rect 
                            width={node.width} 
                            height={node.height} 
                            cornerRadius={cornerRadiusArray}
                            {...fillProps}
                            stroke={strokeProps.fill}
                            strokeWidth={node.strokeWidth}
                            lineJoin="round"
                        />
                    )}
                    {selectionProps && (
                        <Rect 
                            width={node.width}
                            height={node.height}
                            cornerRadius={cornerRadiusArray}
                            {...selectionProps}
                        />
                    )}
                    {hoverProps && (
                         <Rect 
                            width={node.width}
                            height={node.height}
                            cornerRadius={cornerRadiusArray}
                            {...hoverProps}
                        />
                    )}
                    {isHovered && node.type === 'frame' && node.layoutMode !== 'none' && (
                        <Group listening={false}>
                            {node.padding.top > 0 && <Rect x={0} y={0} width={node.width} height={node.padding.top} fill="rgba(255, 0, 255, 0.15)" />}
                            {node.padding.bottom > 0 && <Rect x={0} y={node.height - node.padding.bottom} width={node.width} height={node.padding.bottom} fill="rgba(255, 0, 255, 0.15)" />}
                            {node.padding.left > 0 && <Rect x={0} y={0} width={node.padding.left} height={node.height} fill="rgba(255, 0, 255, 0.15)" />}
                            {node.padding.right > 0 && <Rect x={node.width - node.padding.right} y={0} width={node.padding.right} height={node.height} fill="rgba(255, 0, 255, 0.15)" />}
                            {node.gap > 0 && nodes.filter(c => c.parentId === node.id).slice(1).map((child, idx) => {
                                if (node.layoutMode === 'horizontal') {
                                    return <Rect key={idx} x={child.x - node.gap} y={0} width={node.gap} height={node.height} fill="rgba(255, 0, 255, 0.2)" />;
                                } else {
                                    return <Rect key={idx} x={0} y={child.y - node.gap} width={node.width} height={node.gap} fill="rgba(255, 0, 255, 0.2)" />;
                                }
                            })}
                        </Group>
                    )}
                    {renderNodeHierarchy(node.id)}
                </Group>
            </Group>
        );
    }

    if (node.type === 'rect') {
        const hasSmoothing = node.cornerSmoothing > 0;
        return (
            <Group key={node.id}>
                {hasSmoothing ? (
                    <Path 
                        {...konvaProps} 
                        data={getSuperellipsePath(node.width, node.height, node.cornerRadius, node.cornerSmoothing)} 
                        lineJoin="round"
                    />
                ) : (
                    <Rect {...konvaProps} cornerRadius={cornerRadiusArray} lineJoin="round" />
                )}
                {selectionProps && (
                    <Rect 
                        x={node.x} y={node.y} width={node.width} height={node.height}
                        rotation={node.rotation}
                        cornerRadius={cornerRadiusArray}
                        {...selectionProps}
                    />
                )}
                {hoverProps && (
                    <Rect 
                        x={node.x} y={node.y} width={node.width} height={node.height}
                        rotation={node.rotation}
                        cornerRadius={cornerRadiusArray}
                        {...hoverProps}
                    />
                )}
            </Group>
        );
    }

    if (node.type === 'image') {
        return (
            <KonvaImage 
                key={node.id}
                node={node}
                konvaProps={konvaProps}
                selectionProps={selectionProps}
                hoverProps={hoverProps}
                viewport={viewport}
            />
        );
    }

    if (node.type === 'circle') {
        return (
            <Group key={node.id}>
                <Circle {...konvaProps} radius={Math.abs((node.width || 0) / 2)} lineJoin="round" />
                {selectionProps && (
                    <Circle 
                        x={node.x} y={node.y} radius={Math.abs(node.width / 2)}
                        {...selectionProps}
                    />
                )}
                {hoverProps && (
                    <Circle 
                        x={node.x} y={node.y} radius={Math.abs(node.width / 2)}
                        {...hoverProps}
                    />
                )}
            </Group>
        );
    }
    if (node.type === 'ellipse') {
        return (
            <Group key={node.id}>
                <Ellipse {...konvaProps} radiusX={Math.abs((node.width || 0) / 2)} radiusY={Math.abs((node.height || 0) / 2)} lineJoin="round" />
                {selectionProps && (
                    <Ellipse 
                        x={node.x} y={node.y} radiusX={Math.abs(node.width / 2)} radiusY={Math.abs(node.height / 2)}
                        {...selectionProps}
                    />
                )}
                {hoverProps && (
                    <Ellipse 
                        x={node.x} y={node.y} radiusX={Math.abs(node.width / 2)} radiusY={Math.abs(node.height / 2)}
                        {...hoverProps}
                    />
                )}
            </Group>
        );
    }
    if (node.type === 'path') {
        const pathComp = (
            <Group key={node.id}>
                <Path {...konvaProps} data={(node as any).data} lineJoin="round" />
                {hoverProps && <Path data={(node as any).data} rotation={node.rotation} {...hoverProps} x={node.x} y={node.y} />}
            </Group>
        );
        if (tool === 'direct-select' && isSelected) {
            const points = (node as any).data.replace(/[MLZ]/g, '').trim().split(/\s+/).map(Number);
            const handles = [];
            for (let i = 0; i < points.length; i += 2) {
                const idx = i / 2;
                handles.push(
                    <Circle
                        key={`${node.id}-point-${idx}`}
                        x={node.x + points[i]}
                        y={node.y + points[i+1]}
                        radius={4 / viewport.zoom}
                        fill="#FFFFFF"
                        stroke="#6366F1"
                        strokeWidth={1 / viewport.zoom}
                        draggable
                        onDragMove={(e) => handlePointDragMove(node.id, idx, e)}
                        onDragEnd={() => pushHistory()}
                    />
                );
            }
            return <React.Fragment key={node.id}>{pathComp}{handles}</React.Fragment>;
        }
        return pathComp;
    }
    if (node.type === 'text') {
      return (
        <Group key={node.id}>
            <Text
            {...konvaProps}
            text={(node as any).text}
            fontSize={(node as any).fontSize}
            fontFamily={(node as any).fontFamily}
            align={(node as any).align}
            verticalAlign="top"
            width={node.width}
            height={node.height}
            visible={editingId !== node.id}
            lineHeight={(node as any).lineHeight ? (node as any).lineHeight / (node as any).fontSize : 1.2}
            wrap="word"
            padding={1}
            lineJoin="round"
            opacity={(node as any).writingMode?.includes('vertical') ? 0.9 : node.opacity}
            rotation={node.rotation || ((node as any).writingMode === 'vertical-rl' ? 90 : (node as any).writingMode === 'vertical-lr' ? 90 : 0)}
            />
            {selectionProps && (
                <Rect 
                    x={node.x} y={node.y} width={node.width} height={node.height}
                    rotation={node.rotation}
                    {...selectionProps}
                />
            )}
            {hoverProps && (
                <Rect 
                    x={node.x} y={node.y} width={node.width} height={node.height}
                    rotation={node.rotation}
                    {...hoverProps}
                />
            )}
        </Group>
      );
    }
    return null;
  };

  // Recursive renderer for nodes with Mask support
  const renderNodeHierarchy = (parentNodeId?: string) => {
    const parentNodes = nodes.filter(n => n.parentId === parentNodeId);
    if (parentNodes.length === 0) return null;

    const result: React.ReactNode[] = [];
    let currentMask: SceneNode | null = null;
    let maskedNodes: SceneNode[] = [];

    const flushMask = () => {
        if (currentMask) {
            const mask = currentMask;
            const contents = [...maskedNodes];
            result.push(
                <Group key={`mask-group-${mask.id}`}>
                    {renderSingleNode(mask)}
                    <Group 
                        clipFunc={(ctx) => {
                            ctx.beginPath();
                            
                            // Apply transformation for rotation
                            ctx.save();
                            ctx.translate(mask.x + mask.width / 2, mask.y + mask.height / 2);
                            ctx.rotate((mask.rotation || 0) * Math.PI / 180);
                            ctx.translate(-mask.width / 2, -mask.height / 2);

                            if (mask.type === 'rect' || mask.type === 'frame' || mask.type === 'image') {
                                const r = mask.individualCornerRadius || { topLeft: mask.cornerRadius || 0, topRight: mask.cornerRadius || 0, bottomRight: mask.cornerRadius || 0, bottomLeft: mask.cornerRadius || 0 };
                                const w = mask.width;
                                const h = mask.height;
                                
                                // Standard Rounded Rect with individual corners
                                ctx.moveTo(r.topLeft, 0);
                                ctx.lineTo(w - r.topRight, 0);
                                ctx.quadraticCurveTo(w, 0, w, r.topRight);
                                ctx.lineTo(w, h - r.bottomRight);
                                ctx.quadraticCurveTo(w, h, w - r.bottomRight, h);
                                ctx.lineTo(r.bottomLeft, h);
                                ctx.quadraticCurveTo(0, h, 0, h - r.bottomLeft);
                                ctx.lineTo(0, r.topLeft);
                                ctx.quadraticCurveTo(0, 0, r.topLeft, 0);
                            } else if (mask.type === 'circle') {
                                ctx.arc(mask.width / 2, mask.height / 2, Math.abs(mask.width / 2), 0, Math.PI * 2);
                            } else if (mask.type === 'ellipse') {
                                ctx.ellipse(mask.width / 2, mask.height / 2, Math.abs(mask.width / 2), Math.abs(mask.height / 2), 0, 0, Math.PI * 2);
                            } else if (mask.type === 'text') {
                                ctx.rect(0, 0, mask.width, mask.height);
                            } else if (mask.type === 'path') {
                                const p = new Path2D((mask as any).data);
                                (ctx as any).addPath(p);
                            }
                            ctx.restore();
                        }}
                    >
                        {contents.map(n => renderSingleNode(n))}
                    </Group>
                </Group>
            );
            currentMask = null;
            maskedNodes = [];
        }
    };

    parentNodes.forEach((node) => {
        if (node.isMask) {
            flushMask();
            currentMask = node;
        } else if (currentMask) {
            maskedNodes.push(node);
        } else {
            result.push(renderSingleNode(node));
        }
    });
    flushMask();

    return result;
  };

  return (
    <div id="canvas-container" className={`flex-1 bg-[#1A1A1A] relative overflow-hidden h-full ${tool === 'hand' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}>
       {/* Rulers */}
       <FigmaRulers />

       {/* Grid Overlay */}
       <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
            backgroundImage: `radial-gradient(#FFF 0.5px, transparent 0.5px)`,
            backgroundSize: `${20 * viewport.zoom}px ${20 * viewport.zoom}px`,
            backgroundPosition: `${viewport.x}px ${viewport.y}px`
        }}
       />

      <div 
        ref={containerRef}
        className="absolute top-5 left-5 right-0 bottom-0 overflow-hidden"
      >
        <Stage
          width={dimensions.width}
          height={dimensions.height}
          ref={stageRef}
          scaleX={viewport.zoom}
          scaleY={viewport.zoom}
          x={viewport.x}
          y={viewport.y}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onDblClick={(e) => tool === 'pen' && finalizePenPath()}
          draggable={false}
        >
          <Layer>
            {renderNodeHierarchy()}

            {/* Creation Preview */}
            {newNode && (
              <Group 
                x={newNode.parentId ? getGlobalPosition(newNode.parentId).x : 0} 
                y={newNode.parentId ? getGlobalPosition(newNode.parentId).y : 0}
              >
                {(newNode.type === 'rect' || newNode.type === 'frame') && (
                  <Rect x={newNode.x} y={newNode.y} width={newNode.width} height={newNode.height} fill="#6366F1" opacity={0.2} stroke="#6366F1" strokeWidth={1} lineJoin="round" />
                )}
                {newNode.type === 'circle' && (
                  <Circle x={newNode.x} y={newNode.y} radius={Math.abs(newNode.width / 2)} fill="#6366F1" opacity={0.2} stroke="#6366F1" strokeWidth={1} lineJoin="round" />
                )}
                {newNode.type === 'image' && (
                  <Rect x={newNode.x} y={newNode.y} width={newNode.width} height={newNode.height} fill="#6366F1" opacity={0.2} stroke="#6366F1" strokeWidth={1} lineJoin="round" />
                )}
                {newNode.type === 'ellipse' && (
                  <Ellipse x={newNode.y} y={newNode.y} radiusX={Math.abs(newNode.width / 2)} radiusY={Math.abs(newNode.height / 2)} fill="#6366F1" opacity={0.2} stroke="#6366F1" strokeWidth={1} lineJoin="round" />
                )}
                {newNode.type === 'text' && (
                  <Group>
                      <Rect 
                          x={newNode.width < 0 ? newNode.x + newNode.width : newNode.x} 
                          y={newNode.height < 0 ? newNode.y + newNode.height : newNode.y} 
                          width={Math.abs(newNode.width)} 
                          height={Math.abs(newNode.height)} 
                          stroke="#6366F1" 
                          strokeWidth={1 / viewport.zoom} 
                          dash={[4, 2]} 
                      />
                      <Text 
                          x={newNode.width < 0 ? newNode.x + newNode.width : newNode.x} 
                          y={newNode.height < 0 ? newNode.y + newNode.height : newNode.y}
                          text={(newNode as any).text}
                          fontSize={(newNode as any).fontSize}
                          fontFamily={(newNode as any).fontFamily}
                          fill="#6366F1"
                          opacity={0.5}
                          width={Math.abs(newNode.width)}
                          height={Math.abs(newNode.height)}
                          wrap="word"
                          lineJoin="round"
                      />
                  </Group>
                )}
              </Group>
            )}

            {/* Pen Tool Preview */}
            {penPoints.length > 0 && (
              <Line
                  points={penPoints.flatMap(p => [p.x, p.y])}
                  stroke="#6366F1"
                  strokeWidth={2 / viewport.zoom}
                  lineCap="round"
                  lineJoin="round"
              />
            )}
            {/* Live Pen Drawing */}
            {penPoints.length > 0 && (
                <Group>
                    <Path 
                        data={`M ${penPoints[0].x} ${penPoints[0].y} ` + penPoints.slice(1).map((p, i) => {
                            const prev = penPoints[i];
                            if (prev.cp2 && p.cp1) {
                                return `C ${prev.cp2.x} ${prev.cp2.y}, ${p.cp1.x} ${p.cp1.y}, ${p.x} ${p.y}`;
                            }
                            return `L ${p.x} ${p.y}`;
                        }).join(' ')}
                        stroke="#6366F1"
                        strokeWidth={2 / viewport.zoom}
                    />
                    {penPoints.map((p, i) => (
                        <Group key={i}>
                            <Circle x={p.x} y={p.y} radius={4 / viewport.zoom} fill="white" stroke="#6366F1" strokeWidth={1 / viewport.zoom} />
                            {p.cp1 && p.cp1.x !== p.x && (
                                <>
                                    <Line points={[p.x, p.y, p.cp1.x, p.cp1.y]} stroke="#6366F1" strokeWidth={1 / viewport.zoom} opacity={0.3} />
                                    <Circle x={p.cp1.x} y={p.cp1.y} radius={3 / viewport.zoom} fill="#6366F1" opacity={0.5} />
                                </>
                            )}
                            {p.cp2 && p.cp2.x !== p.x && (
                                <>
                                    <Line points={[p.x, p.y, p.cp2.x, p.cp2.y]} stroke="#6366F1" strokeWidth={1 / viewport.zoom} opacity={0.3} />
                                    <Circle x={p.cp2.x} y={p.cp2.y} radius={3 / viewport.zoom} fill="#6366F1" opacity={0.5} />
                                </>
                            )}
                        </Group>
                    ))}
                    {/* Dash to mouse cursor */}
                    {(() => {
                        const { x, y } = getPointerPosition();
                        return (
                          <Line
                              points={[penPoints[penPoints.length - 1].x, penPoints[penPoints.length - 1].y, x, y]}
                              stroke="#6366F1"
                              strokeWidth={1 / viewport.zoom}
                              dash={[5, 5]}
                          />
                        );
                    })()}
                </Group>
            )}

            {/* Marquee Preview */}
            {selectionRect && (
              <Rect 
                x={selectionRect.x} y={selectionRect.y} 
                width={selectionRect.width} height={selectionRect.height} 
                fill="rgba(99, 102, 241, 0.1)" stroke="#6366F1" strokeWidth={1 / viewport.zoom} 
                dash={[5, 5]}
              />
            )}

            {/* Selection Transformer */}
            {tool === 'select' && (
              <Transformer
                ref={transformerRef}
                boundBoxFunc={(oldBox, newBox) => {
                  if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) return oldBox;
                  return newBox;
                }}
                anchorStroke="#6366F1" anchorFill="#FFFFFF" anchorSize={6} borderStroke="#6366F1" borderDash={[1, 1]}
              />
            )}

            {/* Smart Guides */}
            {guides.map((g, i) => (
              <Line
                  key={`guide-${i}`}
                  points={g.x !== undefined 
                      ? [g.x, -10000, g.x, 10000] 
                      : [-10000, g.y!, 10000, g.y!]}
                  stroke="#FF4D4D"
                  strokeWidth={1 / viewport.zoom}
                  dash={[2, 2]}
              />
            ))}

            {/* Redlines (Measurement) */}
            {altHeld && selectedIds.length > 0 && hoveredId && selectedIds[0] !== hoveredId && (() => {
                const from = nodes.find(n => n.id === selectedIds[0]);
                const to = nodes.find(n => n.id === hoveredId);
                if (!from || !to) return null;

                const fromPos = getGlobalPosition(from.id);
                const toPos = getGlobalPosition(to.id);

                const fromRect = { x: fromPos.x, y: fromPos.y, width: from.width, height: from.height };
                const toRect = { x: toPos.x, y: toPos.y, width: to.width, height: to.height };

                // Simple vertical distance
                const dists = [];
                
                // Helper to draw line + text
                const drawLine = (p1: [number, number], p2: [number, number], label: string) => (
                    <Group key={`${p1}-${p2}`}>
                        <Line points={[...p1, ...p2]} stroke="#FF4D4D" strokeWidth={1/viewport.zoom} />
                        <Group x={(p1[0] + p2[0]) / 2} y={(p1[1] + p2[1]) / 2}>
                          <Rect 
                              x={-10/viewport.zoom} y={-7/viewport.zoom} 
                              width={20/viewport.zoom} height={14/viewport.zoom} 
                              fill="#FF4D4D" cornerRadius={2/viewport.zoom} 
                          />
                          <Text 
                              x={-10/viewport.zoom} y={-5/viewport.zoom}
                              width={20/viewport.zoom}
                              text={label} fontSize={10/viewport.zoom} fill="white" align="center" 
                          />
                        </Group>
                    </Group>
                );

                // 1. TOP to TOP
                if (toRect.y + toRect.height < fromRect.y) {
                    const dist = Math.round(fromRect.y - (toRect.y + toRect.height));
                    dists.push(drawLine([fromRect.x + fromRect.width/2, toRect.y + toRect.height], [fromRect.x + fromRect.width/2, fromRect.y], dist.toString()));
                } else if (toRect.y > fromRect.y + fromRect.height) {
                    const dist = Math.round(toRect.y - (fromRect.y + fromRect.height));
                     dists.push(drawLine([fromRect.x + fromRect.width/2, fromRect.y + fromRect.height], [fromRect.x + fromRect.width/2, toRect.y], dist.toString()));
                }

                // 2. LEFT to LEFT
                if (toRect.x + toRect.width < fromRect.x) {
                  const dist = Math.round(fromRect.x - (toRect.x + toRect.width));
                  dists.push(drawLine([toRect.x + toRect.width, fromRect.y + fromRect.height/2], [fromRect.x, fromRect.y + fromRect.height/2], dist.toString()));
                } else if (toRect.x > fromRect.x + fromRect.width) {
                    const dist = Math.round(toRect.x - (fromRect.x + fromRect.width));
                    dists.push(drawLine([fromRect.x + fromRect.width, fromRect.y + fromRect.height/2], [toRect.x, fromRect.y + fromRect.height/2], dist.toString()));
                }

                return dists;
            })()}
          </Layer>
        </Stage>
      </div>

      {/* Text Editing Overlay */}
      {editingId && nodes.find(n => n.id === editingId) && (() => {
        const node = nodes.find(n => n.id === editingId) as any;
        const globalPos = getGlobalPosition(node.id);
        return (
          <textarea
            autoFocus
            value={editingText}
            onChange={handleTextChange}
            onKeyDown={handleTextKeyDown}
            style={{
              position: 'absolute',
              top: (globalPos.y * viewport.zoom) + viewport.y,
              left: (globalPos.x * viewport.zoom) + viewport.x,
              width: (node.width || 200) * viewport.zoom,
              height: (editingHeight || node.height || 40) * viewport.zoom,
              fontSize: node.fontSize * viewport.zoom,
              fontFamily: node.fontFamily,
              color: node.fill,
              textAlign: node.align || 'left',
              WebkitTextStroke: node.strokeWidth ? `${node.strokeWidth * viewport.zoom}px ${node.stroke}` : 'none',
              background: 'transparent',
              border: `1px solid #6366F1`,
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
              padding: 0,
              margin: 0,
              lineHeight: node.lineHeight ? (node.lineHeight / node.fontSize) : 1.2,
              transform: `rotate(${node.rotation}deg)`,
              transformOrigin: 'top left',
              zIndex: 100,
            }}
          />
        );
      })()}
    </div>
  );
};
