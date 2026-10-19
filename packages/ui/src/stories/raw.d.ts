// The Foundations story reads src/styles.css as text (Vite `?raw`) and computes contrast from the real tokens.
declare module '*.css?raw' {
  const content: string;
  export default content;
}
