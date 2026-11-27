export { default, clientLoader, HydrateFallback } from './table.jsx';
export function loader({ params }) { return { initialCode: params.code.toUpperCase() }; }
