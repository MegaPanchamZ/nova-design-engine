import type { Effect, EllipseNode, SceneNode, TextNode } from '../types';
import { scalePathData } from './pathTooling';

interface ScaleSceneNodeOptions {
  scalePosition?: boolean;
  scaleText?: boolean;
  scaleStyle?: boolean;
}

const scaleEffect = (effect: Effect, scaleX: number, scaleY: number): Effect => {
  const averageScale = (Math.abs(scaleX) + Math.abs(scaleY)) / 2 || 1;

  return {
    ...effect,
    offset: effect.offset
      ? { x: effect.offset.x * scaleX, y: effect.offset.y * scaleY }
      : effect.offset,
    radius: typeof effect.radius === 'number' ? effect.radius * averageScale : effect.radius,
    spread: typeof effect.spread === 'number' ? effect.spread * averageScale : effect.spread,
  };
};

export const scaleSceneNode = (
  node: SceneNode,
  scaleX: number,
  scaleY: number,
  options: ScaleSceneNodeOptions = {}
): SceneNode => {
  const { scalePosition = true, scaleText = true, scaleStyle = true } = options;
  const absScaleX = Math.abs(scaleX) || 1;
  const absScaleY = Math.abs(scaleY) || 1;
  const averageScale = (absScaleX + absScaleY) / 2 || 1;

  const nextNode: SceneNode = {
    ...node,
    x: scalePosition ? node.x * scaleX : node.x,
    y: scalePosition ? node.y * scaleY : node.y,
    width: Math.max(1, node.width * absScaleX),
    height: Math.max(1, node.height * absScaleY),
    effects: node.effects?.map((effect) => scaleEffect(effect, scaleX, scaleY)),
  };

  if (scaleStyle) {
    nextNode.strokeWidth = node.strokeWidth * averageScale;
    nextNode.cornerRadius = node.cornerRadius * averageScale;
    if (node.individualCornerRadius) {
      nextNode.individualCornerRadius = {
        topLeft: node.individualCornerRadius.topLeft * averageScale,
        topRight: node.individualCornerRadius.topRight * averageScale,
        bottomRight: node.individualCornerRadius.bottomRight * averageScale,
        bottomLeft: node.individualCornerRadius.bottomLeft * averageScale,
      };
    }
  }

  if (node.type === 'path') {
    const pathNode = nextNode as typeof node;
    pathNode.data = scalePathData(node.data, scaleX, scaleY);
  }

  if (node.type === 'text' && scaleText) {
    const textNode = nextNode as TextNode;
    textNode.fontSize = Math.max(1, textNode.fontSize * averageScale);
    if (typeof textNode.lineHeight === 'number') {
      textNode.lineHeight = Math.max(1, textNode.lineHeight * averageScale);
    }
  }

  if (node.type === 'ellipse') {
    const ellipseNode = nextNode as EllipseNode;
    ellipseNode.radiusX = (ellipseNode.radiusX || node.width / 2) * absScaleX;
    ellipseNode.radiusY = (ellipseNode.radiusY || node.height / 2) * absScaleY;
  }

  if (node.type === 'image' && node.imageTransform) {
    const imageNode = nextNode as typeof node;
    imageNode.imageTransform = {
      ...node.imageTransform,
      x: node.imageTransform.x * scaleX,
      y: node.imageTransform.y * scaleY,
      scale: node.imageTransform.scale * averageScale,
    };
  }

  return nextNode;
};