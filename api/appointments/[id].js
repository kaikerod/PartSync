import { handleNodeApi } from "../../server/api.js";

export default function handler(req, res) {
  const { id } = req.query || {};
  const pathname = id ? `/api/appointments/${id}` : "/api/appointments";
  return handleNodeApi(req, res, pathname);
}
