// services/dashboard.ts —— 首页统计接口
import request from '../utils/request'
import type { DataReply, DashboardData } from './types'

/** 获取首页 dashboard 统计数据。需要 token。 */
export function getDashboard(): Promise<DashboardData> {
  return request<DataReply<DashboardData>>({
    url: '/api/v1/dashboard/',
    method: 'GET'
  }).then((res) => res.data)
}
