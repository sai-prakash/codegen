// llm-code-generator.ts
import axios from 'axios';
import { SaltComponentMapper } from './salt-component-mapper';

interface CodeGenerationRequest {
  figmaData: any;
  componentContext: string;
  examples?: string[];
  requirements?: string[];
}

interface GeneratedCode {
  code: string;
  imports: string[];
  dependencies: string[];
  warnings: string[];
}

export class LLMCodeGenerator {
  private llmEndpoint: string;
  private apiKey: string;
  private saltMapper: SaltComponentMapper;
  private exampleCache: Map<string, string> = new Map();

  constructor(config: { endpoint: string; apiKey: string }) {
    this.llmEndpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.saltMapper = new SaltComponentMapper();
  }

  async generateReactCode(request: CodeGenerationRequest): Promise<GeneratedCode> {
    try {
      // 1. Map Figma to Salt components
      const saltComponents = this.saltMapper.mapToSaltComponents(request.figmaData);
      const componentContext = this.saltMapper.generateComponentContext(saltComponents);
      
      // 2. Fetch relevant examples
      const examples = await this.fetchRelevantExamples(saltComponents);
      
      // 3. Build enhanced prompt
      const prompt = this.buildPrompt({
        figmaData: request.figmaData,
        componentContext,
        examples,
        requirements: request.requirements || []
      });
      
      // 4. Call LLM
      const response = await this.callLLM(prompt);
      
      // 5. Parse and validate response
      return this.parseAndValidateCode(response);
    } catch (error) {
      console.error('Code generation failed:', error);
      throw new Error(`Failed to generate code: ${error.message}`);
    }
  }

  private buildPrompt(data: {
    figmaData: any;
    componentContext: string;
    examples: string[];
    requirements: string[];
  }): string {
    return `You are an expert React developer specializing in the Salt Design System. 
Generate production-ready React code based on the following Figma design.

FIGMA DESIGN DATA:
${JSON.stringify(data.figmaData, null, 2)}

COMPONENT MAPPING:
${data.componentContext}

RELEVANT SALT EXAMPLES:
${data.examples.join('\n\n')}

REQUIREMENTS:
1. Use Salt Design System components exclusively
2. Follow React best practices and hooks patterns
3. Make the component fully responsive
4. Include proper TypeScript types
5. Add accessibility attributes (aria-labels, roles)
6. Use Salt's design tokens for styling
7. Implement any interactive behaviors detected in the design
${data.requirements.map((req, i) => `${i + 8}. ${req}`).join('\n')}

IMPORTANT RULES:
- Import components from @salt-ds/core
- Wrap the main component in SaltProvider
- Use Salt's spacing scale (1-6) for gaps and padding
- Name the component based on the Figma frame name
- Export as default
- Include error boundaries for robustness
- Add comments explaining complex logic

Generate the complete React component file with all imports and types.`;
  }

  private async fetchRelevantExamples(components: any[]): Promise<string[]> {
    const examples: string[] = [];
    const componentTypes = new Set(components.map(c => c.type));
    
    for (const type of componentTypes) {
      // Check cache first
      if (this.exampleCache.has(type)) {
        examples.push(this.exampleCache.get(type)!);
        continue;
      }
      
      // Fetch from QnA endpoint
      try {
        const example = await this.fetchExampleFromQnA(type);
        if (example) {
          this.exampleCache.set(type, example);
          examples.push(example);
        }
      } catch (error) {
        console.warn(`Failed to fetch example for ${type}:`, error);
      }
    }
    
    return examples;
  }

  private async fetchExampleFromQnA(componentType: string): Promise<string | null> {
    try {
      const response = await axios.post(
        `${this.llmEndpoint}/qna`,
        {
          question: `Show me a complete example of using Salt Design System ${componentType} component with best practices`,
          context: 'salt-design-system'
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.data.answer || null;
    } catch (error) {
      return null;
    }
  }

  private async callLLM(prompt: string): Promise<string> {
    const response = await axios.post(
      this.llmEndpoint,
      {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a React/TypeScript expert specializing in Salt Design System. Generate clean, production-ready code.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.choices[0].message.content;
  }

  private parseAndValidateCode(llmResponse: string): GeneratedCode {
    // Extract code block
    const codeMatch = llmResponse.match(/```(?:tsx?|jsx?)\n([\s\S]*?)\n```/);
    if (!codeMatch) {
      throw new Error('No code block found in LLM response');
    }
    
    const code = codeMatch[1];
    
    // Extract imports
    const importRegex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match;
    
    while ((match = importRegex.exec(code)) !== null) {
      imports.push(match[0]);
    }
    
    // Extract dependencies
    const dependencies = this.extractDependencies(imports);
    
    // Validate code structure
    const warnings = this.validateCode(code);
    
    return {
      code,
      imports,
      dependencies,
      warnings
    };
  }

  private extractDependencies(imports: string[]): string[] {
    const deps = new Set<string>();
    
    imports.forEach(imp => {
      const match = imp.match(/from\s+['"]([^'"]+)['"]/);
      if (match) {
        const dep = match[1];
        if (!dep.startsWith('.') && !dep.startsWith('/')) {
          // Extract package name
          const packageName = dep.startsWith('@') 
            ? dep.split('/').slice(0, 2).join('/')
            : dep.split('/')[0];
          deps.add(packageName);
        }
      }
    });
    
    return Array.from(deps);
  }

  private validateCode(code: string): string[] {
    const warnings: string[] = [];
    
    // Check for Salt provider
    if (!code.includes('SaltProvider')) {
      warnings.push('Component should be wrapped in SaltProvider');
    }
    
    // Check for TypeScript types
    if (!code.includes(': FC') && !code.includes('React.FC')) {
      warnings.push('Consider adding TypeScript types for the component');
    }
    
    // Check for accessibility
    if (!code.includes('aria-') && !code.includes('role=')) {
      warnings.push('Consider adding accessibility attributes');
    }
    
    // Check for error boundaries
    if (!code.includes('ErrorBoundary') && !code.includes('try') && !code.includes('catch')) {
      warnings.push('Consider adding error handling');
    }
    
    return warnings;
  }
}

// Code validator class
export class CodeValidator {
  async validateReactCode(code: string): Promise<{
    valid: boolean;
    errors: string[];
    suggestions: string[];
  }> {
    const errors: string[] = [];
    const suggestions: string[] = [];
    
    try {
      // 1. Check syntax using a parser
      // In a real implementation, use @babel/parser or typescript compiler API
      
      // 2. Check Salt imports
      if (!code.includes('@salt-ds/core')) {
        errors.push('Missing Salt Design System imports');
      }
      
      // 3. Check component structure
      const hasExport = code.includes('export default') || code.includes('export {');
      if (!hasExport) {
        errors.push('Component must be exported');
      }
      
      // 4. Check for common issues
      if (code.includes('className=') && !code.includes('styles.')) {
        suggestions.push('Consider using CSS modules or styled-components for styling');
      }
      
      if (!code.includes('key=') && code.includes('.map(')) {
        suggestions.push('Add key props to mapped elements');
      }
      
      // 5. Check Salt-specific patterns
      const saltComponents = ['Button', 'Input', 'Card', 'Stack', 'Flex'];
      saltComponents.forEach(comp => {
        if (code.includes(`<${comp}`) && !code.includes(`import.*${comp}.*from.*@salt-ds`)) {
          errors.push(`${comp} component used but not imported from Salt`);
        }
      });
      
      return {
        valid: errors.length === 0,
        errors,
        suggestions
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Code validation failed: ${error.message}`],
        suggestions
      };
    }
  }
}
