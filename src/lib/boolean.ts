import paper from 'paper';

export const performBooleanOperation = (
  nodes: any[], 
  operation: 'union' | 'subtract' | 'intersect' | 'exclude'
): string => {
  // Initialize paper if not already (it needs a hidden canvas or project)
  if (!paper.project) {
    paper.setup(document.createElement('canvas'));
  } else {
    paper.project.clear();
  }

  const paperItems = nodes.map(node => {
    let item;
    if (node.type === 'rect') {
      item = new paper.Path.Rectangle(new paper.Rectangle(node.x, node.y, node.width, node.height));
    } else if (node.type === 'circle') {
      item = new paper.Path.Circle(new paper.Point(node.x + node.width / 2, node.y + node.width / 2), node.width / 2);
    } else if (node.type === 'ellipse') {
      item = new paper.Path.Ellipse(new paper.Rectangle(node.x, node.y, node.width, node.height));
    } else if (node.type === 'path') {
      item = new paper.Path();
      item.pathData = node.data;
    }
    
    if (item) {
        item.rotate(node.rotation || 0, new paper.Point(node.x + node.width/2, node.y + node.height/2));
    }
    return item;
  }).filter(item => item !== undefined) as paper.PathItem[];

  if (paperItems.length < 2) return '';

  let result = paperItems[0];
  for (let i = 1; i < paperItems.length; i++) {
    if (operation === 'union') {
      result = result.unite(paperItems[i]);
    } else if (operation === 'subtract') {
      result = result.subtract(paperItems[i]);
    } else if (operation === 'intersect') {
      result = result.intersect(paperItems[i]);
    } else if (operation === 'exclude') {
      result = result.exclude(paperItems[i]);
    }
  }

  return result.pathData;
};
