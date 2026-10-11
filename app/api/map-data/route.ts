import {mapData} from '../../server-map';

export const dynamic='force-dynamic';
export function GET(request: Request){return mapData(request);}
