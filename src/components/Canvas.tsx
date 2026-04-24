import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Rect, Circle, Ellipse, Text, Path, Line, Group, Transformer } from 'react-konva';
import useImage from 'use-image';
import { useStore } from '../store';
import { createDefaultNode, Effect, ImageNode, Paint, PathNode, SceneNode, TextNode, ToolType } from '../types';
import Konva from 'konva';
import { measureText } from '../lib/measureText';
import { getSuperellipsePath } from '../lib/geometry';
import { FigmaRulers } from './Rulers';

type PenPoint = { x: number; y: number; cp1?: { x: number; y: number }; cp2?: { x: number; y: number } };
type CanvasMouseEvent = Konva.KonvaEventObject<MouseEvent>;
type CanvasWheelEvent = Konva.KonvaEventObject<WheelEvent>;
type DrawingTool = Extract<ToolType, 'rect' | 'circle' | 'ellipse' | 'text' | 'frame' | 'section' | 'image'>;

interface ContextMenuState {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
}

interface KonvaImageProps {
  node: ImageNode;
  konvaProps: React.ComponentProps<typeof Rect>;
  selectionProps: React.ComponentProps<typeof Rect> | null;
  hoverProps: React.ComponentProps<typeof Rect> | null;
}

const isFrameLikeNode = (node: SceneNode): boolean =>
  node.type === 'frame' ||
  node.type === 'section' ||
  node.type === 'group' ||
  node.type === 'component' ||
  node.type === 'instance';

interface SanitizedCorners {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

const clampCornerValue = (value: number, fallback: number, maxCornerRadius: number): number => {
  const safeFallback = Number.isFinite(fallback) ? fallback : 0;
  if (!Number.isFinite(value)) return Math.min(maxCornerRadius, Math.max(0, safeFallback));
  return Math.min(maxCornerRadius, Math.max(0, value));
};

const getSanitizedCornerData = (node: Pick<SceneNode, 'width' | 'height' | 'cornerRadius' | 'individualCornerRadius' | 'cornerSmoothing'>) => {
  const safeWidth = Number.isFinite(node.width) ? Math.abs(node.width) : 0;
  const safeHeight = Number.isFinite(node.height) ? Math.abs(node.height) : 0;
  const maxCornerRadius = Math.max(0, Math.min(safeWidth, safeHeight) / 2);
  const uniform = clampCornerValue(node.cornerRadius || 0, 0, maxCornerRadius);
  const corners: SanitizedCorners = {
    topLeft: clampCornerValue(node.individualCornerRadius?.topLeft ?? uniform, uniform, maxCornerRadius),
    topRight: clampCornerValue(node.individualCornerRadius?.topRight ?? uniform, uniform, maxCornerRadius),
    bottomRight: clampCornerValue(node.individualCornerRadius?.bottomRight ?? uniform, uniform, maxCornerRadius),
    bottomLeft: clampCornerValue(node.individualCornerRadius?.bottomLeft ?? uniform, uniform, maxCornerRadius),
  };

  const smoothingRaw = Number.isFinite(node.cornerSmoothing) ? node.cornerSmoothing : 0;
  const smoothing = Math.min(1, Math.max(0, smoothingRaw));

  return {
    uniform,
    corners,
    cornerRadiusArray: [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft] as [number, number, number, number],
    smoothing,
  };
};

const KonvaImage = ({ node, konvaProps, selectionProps, hoverProps }: KonvaImageProps) => {
    const [img] = useImage(node.src, 'anonymous');
    const cornerData = getSanitizedCornerData(node);
    
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
              cornerRadius={cornerData.cornerRadiusArray}
            />
             {selectionProps && (
                <Rect 
                    x={node.x} y={node.y} width={node.width} height={node.height}
                    rotation={node.rotation}
                cornerRadius={cornerData.cornerRadiusArray}
                    {...selectionProps}
                />
            )}
            {hoverProps && (
                <Rect 
                    x={node.x} y={node.y} width={node.width} height={node.height}
                    rotation={node.rotation}
                cornerRadius={cornerData.cornerRadiusArray}
                    {...hoverProps}
                />
            )}
        </Group>
    );
};

export const Canvas = () => {
  const { 
    pages, currentPageId, selectedIds, viewport, tool, setViewport, 
    addNode, updateNode, setSelectedIds, pushHistory, mode, hoveredId, guides: persistentGuides, snapLines, setSnapLines,
    deleteNodes, groupSelected, frameSelected, copySelected, pasteCopied, canPaste
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
  const [penPoints, setPenPoints] = useState<PenPoint[]>([]);
  const [isPenDragging, setIsPenDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Redlines
  const [altHeld, setAltHeld] = useState(false);

  useEffect(() => {
    window.canvasStage = stageRef.current || undefined;
  }, []);

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
      if (e.key === 'Escape') {
        setContextMenu(null);
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
  type PathAnchor = { x: number; y: number; cpIn?: { x: number; y: number }; cpOut?: { x: number; y: number } };

  const clampCoord = (value: number, fallback = 0) => {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(-1_000_000, Math.min(1_000_000, value));
  };

  const clampSize = (value: number, fallback = 1) => {
    if (!Number.isFinite(value)) return Math.max(1, fallback);
    return Math.max(1, Math.min(1_000_000, Math.abs(value)));
  };

  const parsePathData = (data: string): { anchors: PathAnchor[]; closed: boolean } => {
    const tokens = data.match(/[MLCZmlcz]|-?\d*\.?\d+/g) || [];
    const anchors: PathAnchor[] = [];
    let i = 0;
    let cmd = '';
    let closed = false;

    while (i < tokens.length) {
      const token = tokens[i];
      if (/^[MLCZmlcz]$/.test(token)) {
        cmd = token.toUpperCase();
        i += 1;
        if (cmd === 'Z') {
          closed = true;
          continue;
        }
      }

      if (!cmd) break;

      if (cmd === 'M' || cmd === 'L') {
        const x = Number(tokens[i++]);
        const y = Number(tokens[i++]);
        if (Number.isFinite(x) && Number.isFinite(y)) anchors.push({ x, y });
        if (cmd === 'M') cmd = 'L';
        continue;
      }

      if (cmd === 'C') {
        const c1x = Number(tokens[i++]);
        const c1y = Number(tokens[i++]);
        const c2x = Number(tokens[i++]);
        const c2y = Number(tokens[i++]);
        const x = Number(tokens[i++]);
        const y = Number(tokens[i++]);
        if ([c1x, c1y, c2x, c2y, x, y].every(Number.isFinite)) {
          const previous = anchors[anchors.length - 1];
          if (previous) previous.cpOut = { x: c1x, y: c1y };
          anchors.push({ x, y, cpIn: { x: c2x, y: c2y } });
        }
      }
    }

    return { anchors, closed };
  };

  const serializePathData = (anchors: PathAnchor[], closed: boolean) => {
    if (anchors.length === 0) return '';
    let result = `M ${anchors[0].x} ${anchors[0].y}`;
    for (let i = 1; i < anchors.length; i++) {
      const prev = anchors[i - 1];
      const curr = anchors[i];
      if (prev.cpOut || curr.cpIn) {
        const c1 = prev.cpOut || { x: prev.x, y: prev.y };
        const c2 = curr.cpIn || { x: curr.x, y: curr.y };
        result += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${curr.x} ${curr.y}`;
      } else {
        result += ` L ${curr.x} ${curr.y}`;
      }
    }
    if (closed) result += ' Z';
    return result;
  };

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

  const handlePointDragMove = (nodeId: string, index: number, _e: CanvasMouseEvent) => {
    const node = nodes.find(n => n.id === nodeId);
    if (node && node.type === 'path') {
        const { x, y } = getPointerPosition();
        const parsed = parsePathData(node.data);
        const anchors = [...parsed.anchors];
        const target = anchors[index];
        if (!target) return;

        const nextX = x - node.x;
        const nextY = y - node.y;
        const dx = nextX - target.x;
        const dy = nextY - target.y;

        target.x = nextX;
        target.y = nextY;
        if (target.cpIn) target.cpIn = { x: target.cpIn.x + dx, y: target.cpIn.y + dy };
        if (target.cpOut) target.cpOut = { x: target.cpOut.x + dx, y: target.cpOut.y + dy };

        updateNode(nodeId, { data: serializePathData(anchors, parsed.closed) });
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
      if ((n.type !== 'frame' && n.type !== 'section') || excludeIds.includes(n.id)) return false;
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

    const node = createDefaultNode('path', minX, minY) as PathNode;
    node.data = data;
    node.width = Math.max(1, maxX - minX);
    node.height = Math.max(1, maxY - minY);
    node.strokeWidth = 2;
    node.stroke = '#6366F1';
    addNode(node);
    setPenPoints([]);
    pushHistory();
  };

  const handleMouseDown = (e: CanvasMouseEvent) => {
    setContextMenu(null);

    if (e.evt.button === 2) {
      return;
    }

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
    const drawingTools: DrawingTool[] = ['rect', 'circle', 'ellipse', 'text', 'frame', 'section', 'image'];
    const isDrawingTool = drawingTools.includes(tool as DrawingTool);

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

        const node = createDefaultNode(tool as DrawingTool, finalX, finalY);
        node.parentId = parentId;
        node.width = 0;
        node.height = 0;
        setNewNode(node);
        setIsDrawing(true);
        setSelectedIds([]);
        
        // Also start selection marquee in case they drag
        setSelectionRect({ x, y, width: 0, height: 0 });
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
        const clickedFrame = nodes.find(n => n.id === id && (n.type === 'frame' || n.type === 'section'));
        
        if (clickedOnStage) {
            const { x, y } = getPointerPosition();
            setSelectionRect({ x, y, width: 0, height: 0 });
            setSelectedIds([]);
        } else if (clickedFrame) {
            if (e.evt.shiftKey) setSelectedIds(Array.from(new Set([...selectedIds, clickedFrame.id])));
            else setSelectedIds([clickedFrame.id]);
        }
      }
      return;
    }
  };

  const handleMouseMove = (e: CanvasMouseEvent) => {
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
      if (!stage) return;
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
            width: localX - newNode.x,
            height: localY - newNode.y
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
              if (finalNode.type === 'text') finalNode.fontSize = 20; // Default for point text click
              finalNode.horizontalResizing = 'hug';
              finalNode.verticalResizing = 'hug';
            }
            if (finalNode.type === 'image') {
              finalNode.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60';
              finalNode.imageScaleMode = 'fill';
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
      setSelectionRect(null);
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

  const handleCanvasContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    const pointer = getPointerPosition();
    const targetId = e.target?.id?.();

    const isTargetSelected = targetId && selectedIds.includes(targetId);
    const hasMultiSelection = selectedIds.length > 1;

    if (targetId && nodes.some((node) => node.id === targetId) && !isTargetSelected && !hasMultiSelection) {
      setSelectedIds([targetId]);
    }

    setContextMenu({
      x: e.evt.clientX,
      y: e.evt.clientY,
      canvasX: pointer.x,
      canvasY: pointer.y,
    });
  };

  const runContextAction = (action: 'copy' | 'paste' | 'duplicate' | 'group' | 'frame' | 'delete') => {
    if (action === 'copy') {
      copySelected();
      setContextMenu(null);
      return;
    }

    if (action === 'paste') {
      if (!contextMenu) return;
      pasteCopied(contextMenu.canvasX, contextMenu.canvasY);
      pushHistory();
      setContextMenu(null);
      return;
    }

    if (action === 'duplicate') {
      if (!contextMenu) return;
      copySelected();
      pasteCopied(contextMenu.canvasX + 24, contextMenu.canvasY + 24);
      pushHistory();
      setContextMenu(null);
      return;
    }

    if (action === 'group') {
      if (selectedIds.length < 2) return;
      groupSelected();
      pushHistory();
      setContextMenu(null);
      return;
    }

    if (action === 'frame') {
      if (selectedIds.length === 0) return;
      frameSelected();
      pushHistory();
      setContextMenu(null);
      return;
    }

    if (action === 'delete') {
      if (selectedIds.length === 0) return;
      deleteNodes(selectedIds);
      pushHistory();
      setContextMenu(null);
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

  const handleWheel = (e: CanvasWheelEvent) => {
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

  const handleNodeDragStart = (e: CanvasMouseEvent) => {
    const id = e.target.id();
    if (!selectedIds.includes(id)) {
      setSelectedIds([id]);
    }
  };

  const handleNodeDragMove = (e: CanvasMouseEvent) => {
    const node = e.target;
    const stage = stageRef.current;
    if (!stage) return;

    const nodeId = node.id();
    const draggedModel = nodes.find(n => n.id === nodeId);
    if (!draggedModel) return;
    const isCenterAnchored = draggedModel.type === 'circle' || draggedModel.type === 'ellipse';
    const currentWidth = clampSize(Math.abs(node.width() || draggedModel.width), Math.abs(draggedModel.width));
    const currentHeight = clampSize(Math.abs(node.height() || draggedModel.height), Math.abs(draggedModel.height));
    const anchorOffsetX = isCenterAnchored ? currentWidth / 2 : 0;
    const anchorOffsetY = isCenterAnchored ? currentHeight / 2 : 0;

    const parentGlobal = draggedModel.parentId ? getGlobalPosition(draggedModel.parentId) : { x: 0, y: 0 };

    const snapThreshold = 5 / viewport.zoom;
    const newGuides: { x?: number, y?: number }[] = [];
    
    let currentGlobalX = clampCoord(parentGlobal.x + node.x() - anchorOffsetX, draggedModel.x);
    let currentGlobalY = clampCoord(parentGlobal.y + node.y() - anchorOffsetY, draggedModel.y);

    nodes.forEach(otherNode => {
      if (otherNode.id === nodeId) return;
      const otherPos = getGlobalPosition(otherNode.id);

      // Snap X
      if (Math.abs(currentGlobalX - otherPos.x) < snapThreshold) {
        currentGlobalX = otherPos.x;
        newGuides.push({ x: otherPos.x });
      }
      if (Math.abs(currentGlobalX + currentWidth - (otherPos.x + otherNode.width)) < snapThreshold) {
        currentGlobalX = otherPos.x + otherNode.width - currentWidth;
        newGuides.push({ x: otherPos.x + otherNode.width });
      }

      // Snap Y
      if (Math.abs(currentGlobalY - otherPos.y) < snapThreshold) {
        currentGlobalY = otherPos.y;
        newGuides.push({ y: otherPos.y });
      }
      if (Math.abs(currentGlobalY + currentHeight - (otherPos.y + otherNode.height)) < snapThreshold) {
        currentGlobalY = otherPos.y + otherNode.height - currentHeight;
        newGuides.push({ y: otherPos.y + otherNode.height });
      }
    });

    node.x(clampCoord(currentGlobalX - parentGlobal.x + anchorOffsetX, node.x()));
    node.y(clampCoord(currentGlobalY - parentGlobal.y + anchorOffsetY, node.y()));
    setSnapLines(newGuides);
  };

  const handleNodeUpdate = (e: CanvasMouseEvent) => {
    const konvaNode = e.target;
    const nodeId = konvaNode.id();
    const nodeData = nodes.find(n => n.id === nodeId);
    if (!nodeData) return;

    const isTransformEvent = e.type === 'transformend' || e.type === 'transform';

    const newWidth = clampSize(Math.abs(konvaNode.width() * konvaNode.scaleX()), Math.abs(nodeData.width));
    const newHeight = clampSize(Math.abs(konvaNode.height() * konvaNode.scaleY()), Math.abs(nodeData.height));
    const isCenterAnchored = nodeData.type === 'circle' || nodeData.type === 'ellipse';
    const anchorOffsetX = isCenterAnchored ? newWidth / 2 : 0;
    const anchorOffsetY = isCenterAnchored ? newHeight / 2 : 0;

    // Get stage-relative position and convert to canvas-global
    const absolutePos = konvaNode.getAbsolutePosition();
    const globalX = clampCoord((absolutePos.x - viewport.x) / viewport.zoom - anchorOffsetX, nodeData.x);
    const globalY = clampCoord((absolutePos.y - viewport.y) / viewport.zoom - anchorOffsetY, nodeData.y);

    // We want to reparent based on where the node is dropped
    // Exclude self and children to avoid circular dependency
    const getDescendants = (id: string): string[] => {
      const children = nodes.filter(n => n.parentId === id);
      return [id, ...children.flatMap(c => getDescendants(c.id))];
    };
    const excluded = getDescendants(nodeId);
    
    // Use center of node for reparenting detection
    const newParentId = isTransformEvent
      ? nodeData.parentId
      : findInnermostFrame(
        globalX + (konvaNode.width() * konvaNode.scaleX()) / 2,
        globalY + (konvaNode.height() * konvaNode.scaleY()) / 2,
        excluded
      );

    let finalX = globalX;
    let finalY = globalY;

    if (newParentId) {
        const parentPos = getGlobalPosition(newParentId);
        finalX = clampCoord(finalX - parentPos.x, finalX);
        finalY = clampCoord(finalY - parentPos.y, finalY);
    }

    const wasResized = Math.abs(newWidth - nodeData.width) > 0.1 || Math.abs(newHeight - nodeData.height) > 0.1;

    updateNode(nodeId, {
      x: clampCoord(finalX, nodeData.x),
      y: clampCoord(finalY, nodeData.y),
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
    setSnapLines([]);
    pushHistory();
  };

  const renderSingleNode = (node: SceneNode) => {
    const isSelected = selectedIds.includes(node.id);
    const getVisibleFills = (paints: Paint[] | undefined, fallback: string): Paint[] => {
      const visible = (paints || []).filter((paint) => paint.visible !== false);
      if (visible.length > 0) return visible;
      return [{ id: `${node.id}-fallback-fill`, type: 'solid', color: fallback, opacity: 1, visible: true }];
    };

    const getVisibleStrokes = (paints: Paint[] | undefined, fallback: string): Paint[] => {
      const visible = (paints || []).filter((paint) => paint.visible !== false);
      if (visible.length > 0) return visible;
      return [{ id: `${node.id}-fallback-stroke`, type: 'solid', color: fallback, opacity: 1, visible: true }];
    };

    const getLinearGradientPoints = (paint: Paint) => {
      const angle = Number.isFinite(paint.gradientAngle) ? Number(paint.gradientAngle) : 0;
      const radians = (angle * Math.PI) / 180;
      const cx = node.width / 2;
      const cy = node.height / 2;
      const dx = Math.cos(radians) * (node.width / 2);
      const dy = Math.sin(radians) * (node.height / 2);
      return {
        start: { x: cx - dx, y: cy - dy },
        end: { x: cx + dx, y: cy + dy },
      };
    };

    const getGradientStops = (paint: Paint): (number | string)[] => {
      const rawStops = (paint.gradientStops || []).map((stop) => ({
        offset: Math.min(1, Math.max(0, Number.isFinite(stop.offset) ? stop.offset : 0)),
        color: stop.color,
      }));
      const stops = rawStops.length > 0 ? rawStops : [{ offset: 0, color: '#FFFFFF' }, { offset: 1, color: '#000000' }];
      const sorted = [...stops].sort((a, b) => a.offset - b.offset);
      const result: (number | string)[] = [];
      sorted.forEach((stop) => {
        result.push(stop.offset, stop.color);
      });
      return result;
    };

    const getPaintFillProps = (paint: Paint | undefined, fallback: string) => {
      const safePaint = paint || { id: `${node.id}-safe`, type: 'solid' as const, color: fallback, opacity: 1, visible: true };
      const opacity = (node.opacity || 1) * (safePaint.opacity || 1);

      if (safePaint.type === 'solid') {
        return { fill: safePaint.color || fallback, opacity };
      }

      if (safePaint.type === 'gradient-radial') {
        const center = safePaint.gradientCenter || { x: 0.5, y: 0.5 };
        const radius = Math.max(0.05, Math.min(1, safePaint.gradientRadius ?? 0.5));
        const baseRadius = Math.min(Math.abs(node.width), Math.abs(node.height)) * radius;
        return {
          fillRadialGradientStartPoint: { x: center.x * node.width, y: center.y * node.height },
          fillRadialGradientStartRadius: 0,
          fillRadialGradientEndPoint: { x: center.x * node.width, y: center.y * node.height },
          fillRadialGradientEndRadius: baseRadius,
          fillRadialGradientColorStops: getGradientStops(safePaint),
          opacity,
        };
      }

      const { start, end } = getLinearGradientPoints(safePaint);
      return {
        fillLinearGradientStartPoint: start,
        fillLinearGradientEndPoint: end,
        fillLinearGradientColorStops: getGradientStops(safePaint),
        opacity,
      };
    };

    const fillPaints = getVisibleFills(node.fills, node.fill || '#D9D9D9');
    const topFillPaint = fillPaints[fillPaints.length - 1];
    const underFillPaints = fillPaints.slice(0, -1);
    let fillProps = getPaintFillProps(topFillPaint, node.fill || '#D9D9D9');

    const strokePaints = getVisibleStrokes(node.strokes, node.stroke || '#000000');
    const topStrokePaint = strokePaints[strokePaints.length - 1];
    const strokeColor = topStrokePaint?.type === 'solid' ? (topStrokePaint.color || node.stroke) : node.stroke;
    const strokeOpacity = (node.opacity || 1) * (topStrokePaint?.opacity || 1);

    // Keep mask visuals readable and non-destructive on canvas.
    if (node.isMask) {
      fillProps = { fill: 'rgba(59, 130, 246, 0.18)', opacity: 1 };
      underFillPaints.length = 0;
    }
    const cornerData = getSanitizedCornerData(node);
    const cornerRadiusArray = cornerData.cornerRadiusArray;
    const smoothCornerRadius = cornerData.uniform;
    const smoothCornerSmoothing = cornerData.smoothing;

    // Effects
    const effects: Effect[] = node.effects || [];
    const dropShadow = effects.find((effect) => effect.visible !== false && effect.type === 'drop-shadow');
    const shadowProps = dropShadow ? {
        shadowColor: dropShadow.color,
        shadowBlur: dropShadow.radius,
        shadowOffset: dropShadow.offset,
        shadowOpacity: 1,
    } : {};

    const layerBlur = effects.find((effect) => effect.visible !== false && effect.type === 'layer-blur');
    const blurProps = layerBlur ? {
        filters: [Konva.Filters.Blur],
        blurRadius: layerBlur.radius,
    } : {};

    const blendModeMap: Record<string, GlobalCompositeOperation> = {
      'pass-through': 'source-over',
      normal: 'source-over',
      multiply: 'multiply',
      screen: 'screen',
      overlay: 'overlay',
    };

    const { key: _key, ...konvaProps } = {
      id: node.id,
      key: node.id,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      rotation: node.rotation,
      globalCompositeOperation: blendModeMap[node.blendMode || 'normal'] || 'source-over',
      draggable: node.draggable && !node.locked && tool === 'select' && !isPanning,
      listening: node.visible,
      dash: node.isMask ? [8 / viewport.zoom, 4 / viewport.zoom] : undefined,
      cornerRadius: cornerRadiusArray,
      ...shadowProps,
      ...blurProps,
      onDragMove: handleNodeDragMove,
      onDragStart: handleNodeDragStart,
      onDragEnd: handleNodeUpdate,
      onTransformEnd: handleNodeUpdate,
        onTransform: (e: CanvasMouseEvent) => {
          const nodeTarget = e.target;
          if (isFrameLikeNode(node)) {
            return;
          }
          const scaleX = nodeTarget.scaleX();
          const scaleY = nodeTarget.scaleY();
          
          const isShift = e.evt.shiftKey;
          const isAlt = e.evt.altKey;

          const newWidth = clampSize(nodeTarget.width() * scaleX, node.width);
          const newHeight = clampSize(nodeTarget.height() * scaleY, node.height);

          // Constraints: if text node with hug, we might want to restrict height
          // but Konva Transformer generally changes width/height directly here.
          
          nodeTarget.setAttrs({
            width: newWidth,
            height: newHeight,
            scaleX: 1,
            scaleY: 1
          });

          if (isAlt) {
              // Center scaling is natively handled by Transformer if centeredScaling=true,
              // but we can manually adjust if needed or just rely on Konva.
              // For now we improve the min-size behavior.
          }
      },
      onClick: (e: CanvasMouseEvent) => {
        if (node.locked) return;
        if (typeof e.evt.button === 'number' && e.evt.button !== 0) return;
        e.cancelBubble = true;
        if (e.evt.shiftKey) {
          setSelectedIds(Array.from(new Set([...selectedIds, node.id])));
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

    if (node.type === 'frame' || node.type === 'section' || node.type === 'group' || node.type === 'component' || node.type === 'instance') {
        const hasSmoothing = smoothCornerSmoothing > 0;
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
                      const r = cornerData.corners;
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
                  {underFillPaints.map((paint) => {
                    const layerProps = getPaintFillProps(paint, node.fill || '#D9D9D9');
                    if (hasSmoothing) {
                      return (
                        <Path
                          key={`${node.id}-under-${paint.id}`}
                          data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                          {...layerProps}
                          listening={false}
                        />
                      );
                    }
                    return (
                      <Rect
                        key={`${node.id}-under-${paint.id}`}
                        width={node.width}
                        height={node.height}
                        cornerRadius={cornerRadiusArray}
                        {...layerProps}
                        lineJoin="round"
                        listening={false}
                      />
                    );
                  })}
                    {hasSmoothing ? (
                        <Path 
                        data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                            {...fillProps}
                        />
                    ) : (
                        <Rect 
                            width={node.width} 
                            height={node.height} 
                            cornerRadius={cornerRadiusArray}
                            {...fillProps}
                            lineJoin="round"
                        />
                    )}
                  {node.strokeWidth > 0 && (
                    hasSmoothing ? (
                      <Path
                        data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                        fillEnabled={false}
                        stroke={strokeColor}
                        strokeWidth={node.strokeWidth}
                        opacity={strokeOpacity}
                        listening={false}
                      />
                    ) : (
                      <Rect
                        width={node.width}
                        height={node.height}
                        cornerRadius={cornerRadiusArray}
                        fillEnabled={false}
                        stroke={strokeColor}
                        strokeWidth={node.strokeWidth}
                        opacity={strokeOpacity}
                        lineJoin="round"
                        listening={false}
                      />
                    )
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
                    {isHovered && (node.type === 'frame' || node.type === 'section' || node.type === 'group' || node.type === 'component' || node.type === 'instance') && node.layoutMode !== 'none' && (
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
      const hasSmoothing = smoothCornerSmoothing > 0;
        return (
            <Group key={node.id}>
          {underFillPaints.map((paint) => {
            const layerProps = getPaintFillProps(paint, node.fill || '#D9D9D9');
            if (hasSmoothing) {
              return (
                <Path
                  key={`${node.id}-under-${paint.id}`}
                  x={node.x}
                  y={node.y}
                  rotation={node.rotation}
                  data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                  {...layerProps}
                  listening={false}
                  lineJoin="round"
                />
              );
            }
            return (
              <Rect
                key={`${node.id}-under-${paint.id}`}
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rotation={node.rotation}
                cornerRadius={cornerRadiusArray}
                {...layerProps}
                lineJoin="round"
                listening={false}
              />
            );
          })}
                {hasSmoothing ? (
                    <Path 
                        {...konvaProps} 
              {...fillProps}
              data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)} 
                        lineJoin="round"
                    />
                ) : (
            <Rect {...konvaProps} {...fillProps} cornerRadius={cornerRadiusArray} lineJoin="round" />
                )}
          {node.strokeWidth > 0 && (
            hasSmoothing ? (
              <Path
                x={node.x}
                y={node.y}
                rotation={node.rotation}
                data={getSuperellipsePath(node.width, node.height, smoothCornerRadius, smoothCornerSmoothing)}
                fillEnabled={false}
                stroke={strokeColor}
                strokeWidth={node.strokeWidth}
                opacity={strokeOpacity}
                listening={false}
                lineJoin="round"
              />
            ) : (
              <Rect
                x={node.x}
                y={node.y}
                width={node.width}
                height={node.height}
                rotation={node.rotation}
                cornerRadius={cornerRadiusArray}
                fillEnabled={false}
                stroke={strokeColor}
                strokeWidth={node.strokeWidth}
                opacity={strokeOpacity}
                listening={false}
                lineJoin="round"
              />
            )
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
            />
        );
    }

    if (node.type === 'circle') {
        const radius = Math.abs(node.width / 2);
        const circleProps = {
            ...konvaProps,
            x: node.x + radius,
            y: node.y + radius,
        radius: radius,
        ...fillProps,
        };
        return (
            <Group key={node.id}>
          {underFillPaints.map((paint) => {
            const layerProps = getPaintFillProps(paint, node.fill || '#D9D9D9');
            return (
              <Circle
                key={`${node.id}-under-${paint.id}`}
                x={node.x + radius}
                y={node.y + radius}
                radius={radius}
                rotation={node.rotation}
                {...layerProps}
                listening={false}
                lineJoin="round"
              />
            );
          })}
                <Circle {...circleProps} lineJoin="round" />
          {node.strokeWidth > 0 && (
            <Circle
              x={node.x + radius}
              y={node.y + radius}
              radius={radius}
              rotation={node.rotation}
              fillEnabled={false}
              stroke={strokeColor}
              strokeWidth={node.strokeWidth}
              opacity={strokeOpacity}
              listening={false}
              lineJoin="round"
            />
          )}
                {selectionProps && (
                    <Circle 
                        x={node.x + radius} y={node.y + radius} radius={radius}
                        {...selectionProps}
                    />
                )}
                {hoverProps && (
                    <Circle 
                        x={node.x + radius} y={node.y + radius} radius={radius}
                        {...hoverProps}
                    />
                )}
            </Group>
        );
    }
    if (node.type === 'ellipse') {
        const radiusX = Math.abs(node.width / 2);
        const radiusY = Math.abs(node.height / 2);
        const ellipseProps = {
            ...konvaProps,
            x: node.x + radiusX,
            y: node.y + radiusY,
            radiusX: radiusX,
        radiusY: radiusY,
        ...fillProps,
        };
        return (
            <Group key={node.id}>
          {underFillPaints.map((paint) => {
            const layerProps = getPaintFillProps(paint, node.fill || '#D9D9D9');
            return (
              <Ellipse
                key={`${node.id}-under-${paint.id}`}
                x={node.x + radiusX}
                y={node.y + radiusY}
                radiusX={radiusX}
                radiusY={radiusY}
                rotation={node.rotation}
                {...layerProps}
                listening={false}
                lineJoin="round"
              />
            );
          })}
                <Ellipse {...ellipseProps} lineJoin="round" />
          {node.strokeWidth > 0 && (
            <Ellipse
              x={node.x + radiusX}
              y={node.y + radiusY}
              radiusX={radiusX}
              radiusY={radiusY}
              rotation={node.rotation}
              fillEnabled={false}
              stroke={strokeColor}
              strokeWidth={node.strokeWidth}
              opacity={strokeOpacity}
              listening={false}
              lineJoin="round"
            />
          )}
                {selectionProps && (
                    <Ellipse 
                        x={node.x + radiusX} y={node.y + radiusY} radiusX={radiusX} radiusY={radiusY}
                        {...selectionProps}
                    />
                )}
                {hoverProps && (
                    <Ellipse 
                        x={node.x + radiusX} y={node.y + radiusY} radiusX={radiusX} radiusY={radiusY}
                        {...hoverProps}
                    />
                )}
            </Group>
        );
    }
    if (node.type === 'path') {
        const pathComp = (
            <Group key={node.id}>
          {underFillPaints.map((paint) => (
            <Path
              key={`${node.id}-under-${paint.id}`}
              x={node.x}
              y={node.y}
              rotation={node.rotation}
              data={node.data}
              {...getPaintFillProps(paint, node.fill || '#D9D9D9')}
              lineJoin="round"
              listening={false}
            />
          ))}
          <Path {...konvaProps} {...fillProps} data={node.data} lineJoin="round" />
          {node.strokeWidth > 0 && (
            <Path
              x={node.x}
              y={node.y}
              rotation={node.rotation}
              data={node.data}
              fillEnabled={false}
              stroke={strokeColor}
              strokeWidth={node.strokeWidth}
              opacity={strokeOpacity}
              lineJoin="round"
              listening={false}
            />
          )}
                {hoverProps && <Path data={node.data} rotation={node.rotation} {...hoverProps} x={node.x} y={node.y} />}
            </Group>
        );
        if (tool === 'direct-select' && isSelected) {
          const parsed = parsePathData(node.data);
            const handles = [];
          for (let idx = 0; idx < parsed.anchors.length; idx++) {
            const anchor = parsed.anchors[idx];
                handles.push(
                    <Circle
                        key={`${node.id}-point-${idx}`}
                x={node.x + anchor.x}
                y={node.y + anchor.y}
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
      const lineHeight = node.lineHeight ? node.lineHeight / node.fontSize : 1.2;
      const isVerticalWriting = node.writingMode === 'vertical-rl' || node.writingMode === 'vertical-lr';
      const resolvedRotation = node.rotation || (isVerticalWriting ? 90 : 0);
      const topTextPaintProps = getPaintFillProps(topFillPaint, node.fill || '#D9D9D9');
      const baseTextOpacity = Number.isFinite((topTextPaintProps as { opacity?: number }).opacity)
        ? Number((topTextPaintProps as { opacity?: number }).opacity)
        : (node.opacity || 1);
      const textBaseProps = {
        text: node.text,
        fontSize: node.fontSize,
        fontFamily: node.fontFamily,
        align: node.align,
        verticalAlign: 'top' as const,
        width: node.width,
        height: node.height,
        visible: editingId !== node.id,
        lineHeight,
        wrap: 'word' as const,
        padding: 1,
        lineJoin: 'round' as const,
      };
      return (
        <Group key={node.id}>
            {underFillPaints.map((paint) => {
              const layerPaintProps = getPaintFillProps(paint, node.fill || '#D9D9D9');
              const layerOpacity = Number.isFinite((layerPaintProps as { opacity?: number }).opacity)
                ? Number((layerPaintProps as { opacity?: number }).opacity)
                : (node.opacity || 1);
              return (
                <Text
                  key={`${node.id}-under-${paint.id}`}
                  x={node.x}
                  y={node.y}
                  rotation={resolvedRotation}
                  {...textBaseProps}
                  {...layerPaintProps}
                  opacity={isVerticalWriting ? layerOpacity * 0.9 : layerOpacity}
                  listening={false}
                />
              );
            })}
            <Text
            {...konvaProps}
            {...textBaseProps}
            {...topTextPaintProps}
            opacity={isVerticalWriting ? baseTextOpacity * 0.9 : baseTextOpacity}
            rotation={resolvedRotation}
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

                            if (mask.type === 'rect' || mask.type === 'frame' || mask.type === 'section' || mask.type === 'image') {
                              const r = getSanitizedCornerData(mask).corners;
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
                              const parsed = parsePathData(mask.data || '');
                              if (parsed.anchors.length > 0) {
                                ctx.moveTo(parsed.anchors[0].x, parsed.anchors[0].y);
                                for (let i = 1; i < parsed.anchors.length; i++) {
                                  const prev = parsed.anchors[i - 1];
                                  const curr = parsed.anchors[i];
                                  if (prev.cpOut || curr.cpIn) {
                                    const c1 = prev.cpOut || { x: prev.x, y: prev.y };
                                    const c2 = curr.cpIn || { x: curr.x, y: curr.y };
                                    ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, curr.x, curr.y);
                                  } else {
                                    ctx.lineTo(curr.x, curr.y);
                                  }
                                }
                                if (parsed.closed) ctx.closePath();
                              } else {
                                ctx.rect(0, 0, Math.max(1, mask.width), Math.max(1, mask.height));
                              }
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
    <div
      id="canvas-container"
      className={`flex-1 bg-[#1A1A1A] relative overflow-hidden h-full ${tool === 'hand' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
      onClick={() => setContextMenu(null)}
    >
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
          onContextMenu={handleCanvasContextMenu}
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
                {(newNode.type === 'rect' || newNode.type === 'frame' || newNode.type === 'section') && (
                  <Rect x={newNode.x} y={newNode.y} width={newNode.width} height={newNode.height} fill="#6366F1" opacity={0.2} stroke="#6366F1" strokeWidth={1} lineJoin="round" />
                )}
                {newNode.type === 'circle' && (
                  <Circle
                    x={newNode.x + newNode.width / 2}
                    y={newNode.y + newNode.width / 2}
                    radius={Math.abs(newNode.width / 2)}
                    fill="#6366F1"
                    opacity={0.2}
                    stroke="#6366F1"
                    strokeWidth={1}
                    lineJoin="round"
                  />
                )}
                {newNode.type === 'image' && (
                  <Rect x={newNode.x} y={newNode.y} width={newNode.width} height={newNode.height} fill="#6366F1" opacity={0.2} stroke="#6366F1" strokeWidth={1} lineJoin="round" />
                )}
                {newNode.type === 'ellipse' && (
                  <Ellipse
                    x={newNode.x + newNode.width / 2}
                    y={newNode.y + newNode.height / 2}
                    radiusX={Math.abs(newNode.width / 2)}
                    radiusY={Math.abs(newNode.height / 2)}
                    fill="#6366F1"
                    opacity={0.2}
                    stroke="#6366F1"
                    strokeWidth={1}
                    lineJoin="round"
                  />
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
                          text={newNode.text}
                          fontSize={newNode.fontSize}
                          fontFamily={newNode.fontFamily}
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
                keepRatio={false}
                centeredScaling={false}
                shiftBehavior="inverted"
                boundBoxFunc={(oldBox, newBox) => {
                  if (Math.abs(newBox.width) < 1 || Math.abs(newBox.height) < 1) return oldBox;
                  return newBox;
                }}
                anchorStroke="#6366F1" anchorFill="#FFFFFF" anchorSize={6} borderStroke="#6366F1" borderDash={[1, 1]}
              />
            )}

            {/* Persistent Guides */}
            {persistentGuides.map((g) => (
              <Line
                  key={`persistent-guide-${g.id}`}
                  points={g.type === 'vertical'
                      ? [g.position, -10000, g.position, 10000]
                      : [-10000, g.position, 10000, g.position]}
                  stroke="#3B82F6"
                  strokeWidth={1 / viewport.zoom}
              />
            ))}

            {/* Smart Guides */}
            {snapLines.map((g, i) => (
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

      {contextMenu && (
        <div
          className="fixed z-[120] w-48 rounded-xl border border-[#2A2A2A] bg-[#0B0B0B] p-1 shadow-2xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => runContextAction('copy')}
            disabled={selectedIds.length === 0}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Copy Selection
          </button>
          <button
            onClick={() => runContextAction('paste')}
            disabled={!canPaste()}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Paste Here
          </button>
          <button
            onClick={() => runContextAction('duplicate')}
            disabled={selectedIds.length === 0}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Duplicate
          </button>

          <div className="my-1 h-px bg-[#262626]" />

          <button
            onClick={() => runContextAction('group')}
            disabled={selectedIds.length < 2}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Group Selection
          </button>
          <button
            onClick={() => runContextAction('frame')}
            disabled={selectedIds.length === 0}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-[#C4C4C4] transition-colors hover:bg-[#1F1F1F] hover:text-white disabled:opacity-35"
          >
            Frame Selection
          </button>

          <div className="my-1 h-px bg-[#262626]" />

          <button
            onClick={() => runContextAction('delete')}
            disabled={selectedIds.length === 0}
            className="flex w-full items-center rounded-lg px-2.5 py-2 text-xs text-red-300 transition-colors hover:bg-red-600/20 hover:text-red-200 disabled:opacity-35"
          >
            Delete
          </button>
        </div>
      )}

      {/* Text Editing Overlay */}
      {editingId && nodes.find(n => n.id === editingId && n.type === 'text') && (() => {
        const node = nodes.find((n): n is TextNode => n.id === editingId && n.type === 'text');
        if (!node) return null;
        const globalPos = getGlobalPosition(node.id);
        const visibleTextFill = (node.fills || []).filter((p) => p.visible !== false && p.type === 'solid').slice(-1)[0];
        const textColor = visibleTextFill?.color || node.fill;
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
              color: textColor,
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
