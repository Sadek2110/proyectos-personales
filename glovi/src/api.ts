export class ApiError extends Error { constructor(public code:string) {super(code);} }
export async function api(path:string,method='GET',body?:unknown,token?:string) {
  const response=await fetch('/api'+path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok) throw new ApiError(data.error?.code??'error');
  return data;
}
