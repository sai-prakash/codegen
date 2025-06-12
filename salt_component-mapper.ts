// salt-component-mapper.ts
import { FigmaNode, SaltComponent } from './types';

export class SaltComponentMapper {
  private componentMap = {
    // Figma component names to Salt components
    'Button': '@salt-ds/core/Button',
    'Input': '@salt-ds/core/Input',
    'Card': '@salt-ds/core/Card',
    'Text': '@salt-ds/core/Text',
    'Stack': '@salt-ds/core/StackLayout',
    'Grid': '@salt-ds/core/GridLayout',
    'Flex': '@salt-ds/core/FlexLayout',
    'Dropdown': '@salt-ds/core/Dropdown',
    'Checkbox': '@salt-ds/core/Checkbox',
    'Radio': '@salt-ds/core/RadioButton',
    'Switch': '@salt-ds/core/Switch',
    'Dialog': '@salt-ds/core/Dialog',
    'Tabs': '@salt-ds/core/Tabs',
    'Avatar': '@salt-ds/core/Avatar',
    'Badge': '@salt-ds/core/Badge',
    'Tooltip': '@salt-ds/core/Tooltip'
  };

  private styleMap = {
    // Figma properties to Salt props
    'primary': 'variant="primary"',
    'secondary': 'variant="secondary"',
    'large': 'size="large"',
    'medium': 'size="medium"',
    'small': 'size="small"',
    'disabled': 'disabled',
    'error': 'validationStatus="error"',
    'warning': 'validationStatus="warning"',
    'success': 'validationStatus="success"'
  };

  mapToSaltComponents(figmaData: any): SaltComponent[] {
    const components: SaltComponent[] = [];
    this.processNode(figmaData.structure, components);
    return components;
  }

  private processNode(node: any, components: SaltComponent[], parent?: SaltComponent): void {
    const saltComponent = this.createSaltComponent(node);
    
    if (saltComponent) {
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(saltComponent);
      } else {
        components.push(saltComponent);
      }
      
      // Process children
      if (node.children) {
        node.children.forEach((child: any) => {
          this.processNode(child, components, saltComponent);
        });
      }
    } else if (node.children) {
      // If no Salt component mapping, process children with current parent
      node.children.forEach((child: any) => {
        this.processNode(child, components, parent);
      });
    }
  }

  private createSaltComponent(node: any): SaltComponent | null {
    // Detect component type based on Figma node
    const componentType = this.detectComponentType(node);
    
    if (!componentType) return null;

    const component: SaltComponent = {
      type: componentType,
      props: this.extractProps(node, componentType),
      children: [],
      import: this.componentMap[componentType] || componentType
    };

    // Handle text content
    if (node.type === 'TEXT' && node.text) {
      component.content = node.text;
    }

    return component;
  }

  private detectComponentType(node: any): string | null {
    // Check for explicit component mapping
    if (node.name) {
      // Check if name contains component hints
      for (const [figmaName, saltComponent] of Object.entries(this.componentMap)) {
        if (node.name.toLowerCase().includes(figmaName.toLowerCase())) {
          return figmaName;
        }
      }
    }

    // Infer from node type and properties
    switch (node.type) {
      case 'TEXT':
        return 'Text';
      case 'FRAME':
        if (node.layout?.mode === 'VERTICAL') return 'Stack';
        if (node.layout?.mode === 'HORIZONTAL') return 'Flex';
        if (node.cornerRadius > 0) return 'Card';
        return 'Box';
      case 'RECTANGLE':
        if (node.name?.toLowerCase().includes('button')) return 'Button';
        if (node.cornerRadius > 0) return 'Card';
        return 'Box';
      case 'COMPONENT':
      case 'INSTANCE':
        // Try to match by component name
        return this.matchComponentName(node.name);
      default:
        return null;
    }
  }

  private matchComponentName(name: string): string | null {
    if (!name) return null;
    
    const normalizedName = name.toLowerCase();
    
    // Direct matches
    for (const componentName of Object.keys(this.componentMap)) {
      if (normalizedName.includes(componentName.toLowerCase())) {
        return componentName;
      }
    }

    // Pattern matching for common UI patterns
    if (normalizedName.includes('btn') || normalizedName.includes('cta')) return 'Button';
    if (normalizedName.includes('input') || normalizedName.includes('field')) return 'Input';
    if (normalizedName.includes('dropdown') || normalizedName.includes('select')) return 'Dropdown';
    if (normalizedName.includes('card') || normalizedName.includes('tile')) return 'Card';
    if (normalizedName.includes('modal') || normalizedName.includes('dialog')) return 'Dialog';
    
    return null;
  }

  private extractProps(node: any, componentType: string): Record<string, any> {
    const props: Record<string, any> = {};

    // Extract common props
    if (node.visible === false) {
      props.hidden = true;
    }

    // Component-specific prop extraction
    switch (componentType) {
      case 'Button':
        props.variant = this.detectButtonVariant(node);
        props.size = this.detectSize(node);
        if (node.name?.toLowerCase().includes('disabled')) {
          props.disabled = true;
        }
        break;
        
      case 'Input':
        props.placeholder = node.name || 'Enter text...';
        if (node.name?.toLowerCase().includes('error')) {
          props.validationStatus = 'error';
        }
        break;
        
      case 'Card':
        if (node.fills?.[0]) {
          props.variant = node.fills[0].opacity < 1 ? 'secondary' : 'primary';
        }
        if (node.padding) {
          props.padding = this.mapSpacing(node.padding);
        }
        break;
        
      case 'Stack':
      case 'Flex':
        if (node.layout) {
          props.gap = this.mapSpacing(node.layout.gap);
          props.align = this.mapAlignment(node.layout.align);
          if (componentType === 'Flex') {
            props.justify = this.mapJustify(node.layout.justify);
          }
        }
        break;
    }

    // Extract style props
    if (node.style) {
      Object.assign(props, this.extractStyleProps(node.style));
    }

    return props;
  }

  private detectButtonVariant(node: any): string {
    const name = node.name?.toLowerCase() || '';
    if (name.includes('primary') || node.fills?.[0]?.color) return 'primary';
    if (name.includes('secondary')) return 'secondary';
    if (name.includes('ghost') || name.includes('text')) return 'ghost';
    return 'primary';
  }

  private detectSize(node: any): string {
    // Detect size based on height or name
    const height = node.absoluteBoundingBox?.height;
    const name = node.name?.toLowerCase() || '';
    
    if (name.includes('small') || height < 32) return 'small';
    if (name.includes('large') || height > 48) return 'large';
    return 'medium';
  }

  private mapSpacing(value: number | any): number {
    // Map Figma spacing to Salt spacing scale
    if (typeof value === 'object') {
      // Average padding values
      value = (value.top + value.right + value.bottom + value.left) / 4;
    }
    
    if (value <= 4) return 1;
    if (value <= 8) return 2;
    if (value <= 16) return 3;
    if (value <= 24) return 4;
    if (value <= 32) return 5;
    return 6;
  }

  private mapAlignment(align: string): string {
    const alignMap: Record<string, string> = {
      'MIN': 'start',
      'CENTER': 'center',
      'MAX': 'end',
      'SPACE_BETWEEN': 'stretch'
    };
    return alignMap[align] || 'start';
  }

  private mapJustify(justify: string): string {
    const justifyMap: Record<string, string> = {
      'MIN': 'start',
      'CENTER': 'center',
      'MAX': 'end',
      'SPACE_BETWEEN': 'space-between',
      'SPACE_AROUND': 'space-around',
      'SPACE_EVENLY': 'space-evenly'
    };
    return justifyMap[justify] || 'start';
  }

  private extractStyleProps(style: any): Record<string, any> {
    const props: Record<string, any> = {};
    
    if (style.fontSize) {
      props.fontSize = style.fontSize;
    }
    
    if (style.fontWeight) {
      props.fontWeight = style.fontWeight;
    }
    
    if (style.textAlign) {
      props.textAlign = style.textAlign.toLowerCase();
    }
    
    return props;
  }

  generateComponentContext(components: SaltComponent[]): string {
    // Generate context for LLM
    const imports = new Set<string>();
    const componentTree: string[] = [];
    
    this.buildComponentTree(components, componentTree, imports, 0);
    
    return `
Salt Design System Component Structure:

Imports needed:
${Array.from(imports).map(imp => `import { ${imp.split('/').pop()} } from '${imp}';`).join('\n')}

Component hierarchy:
${componentTree.join('\n')}

Additional context:
- Use Salt's design tokens for consistent styling
- Wrap everything in SaltProvider
- Use proper spacing props (1-6 scale)
- Follow Salt's accessibility guidelines
`;
  }

  private buildComponentTree(
    components: SaltComponent[], 
    tree: string[], 
    imports: Set<string>, 
    level: number
  ): void {
    components.forEach(component => {
      imports.add(component.import);
      const indent = '  '.repeat(level);
      const propsStr = Object.entries(component.props)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');
      
      tree.push(`${indent}<${component.type} ${propsStr}>`);
      
      if (component.content) {
        tree.push(`${indent}  ${component.content}`);
      }
      
      if (component.children && component.children.length > 0) {
        this.buildComponentTree(component.children, tree, imports, level + 1);
      }
      
      tree.push(`${indent}</${component.type}>`);
    });
  }
}

// Type definitions
interface SaltComponent {
  type: string;
  import: string;
  props: Record<string, any>;
  children?: SaltComponent[];
  content?: string;
}
