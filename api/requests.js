import { handleNodeApi } from "../server/api.js";

export default function handler(req, res) {
  return handleNodeApi(req, res, "/api/requests");
}
