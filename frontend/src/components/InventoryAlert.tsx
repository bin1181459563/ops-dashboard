/**
 * 库存预警组件 - 前台+大仓双维度预警，列表内直接编辑阈值和排除
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchAllInventoryItems,
  updateSingleItemConfig,
  type AllInventoryItem,
} from "../lib/dashboardApi";

interface InventoryAlertProps {
  className?: string;
}

export default function InventoryAlert({ className = "" }: InventoryAlertProps) {
  const [items, setItems] = useState<AllInventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [frontFile, setFrontFile] = useState("");
  const [whFile, setWhFile] = useState("");
  const [defaultThreshold, setDefaultThreshold] = useState(20);
  // 筛选：alert=预警, critical=严重(前台缺+大仓无), all=全部, excluded=已排除
  const [filter, setFilter] = useState<"alert" | "critical" | "all" | "excluded">("alert");
  const [savingItem, setSavingItem] = useState("");
  const [search, setSearch] = useState("");

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchAllInventoryItems();
      if (result.status === "ok") {
        setItems(result.items);
        setFrontFile(result.front_file || "");
        setWhFile(result.wh_file || "");
        setDefaultThreshold(result.config?.default_threshold || 20);
      } else {
        setError((result as any).message || "加载失败");
      }
    } catch (e: any) {
      setError(e.message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 更新单个商品阈值（防抖保存）
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleThresholdChange = useCallback(
    (itemName: string, newThreshold: number) => {
      setItems((prev) =>
        prev.map((it) => {
          if (it.item_name !== itemName) return it;
          const frontLow = !it.is_excluded && it.front_stock < newThreshold;
          let status: AllInventoryItem["status"] = it.is_excluded
            ? "excluded"
            : frontLow && it.wh_empty
            ? "critical"
            : frontLow
            ? "warning"
            : "ok";
          return {
            ...it,
            threshold: newThreshold,
            front_low: frontLow,
            status,
            shortage: it.is_excluded ? 0 : Math.max(0, newThreshold - it.front_stock),
          };
        })
      );
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        setSavingItem(itemName);
        try {
          await updateSingleItemConfig(itemName, "set_threshold", newThreshold);
        } catch (e) {
          console.error("保存阈值失败:", e);
        } finally {
          setSavingItem("");
        }
      }, 500);
    },
    []
  );

  // 切换排除/包含
  const handleToggleExclude = useCallback(
    async (item: AllInventoryItem) => {
      const action = item.is_excluded ? "include" : "exclude";
      setSavingItem(item.item_name);
      try {
        await updateSingleItemConfig(item.item_name, action);
        // 刷新数据（排除/恢复会改变阈值逻辑）
        await loadData();
      } catch (e) {
        console.error("更新排除状态失败:", e);
      } finally {
        setSavingItem("");
      }
    },
    [loadData]
  );

  // 统计
  const alertCount = items.filter((it) => it.status === "warning" || it.status === "critical").length;
  const criticalCount = items.filter((it) => it.status === "critical").length;
  const excludedCount = items.filter((it) => it.status === "excluded").length;
  const totalShortage = items
    .filter((it) => it.status === "warning" || it.status === "critical")
    .reduce((s, it) => s + it.shortage, 0);

  // 筛选+搜索
  const filteredItems = items.filter((it) => {
    if (filter === "alert" && it.status !== "warning" && it.status !== "critical") return false;
    if (filter === "critical" && it.status !== "critical") return false;
    if (filter === "excluded" && it.status !== "excluded") return false;
    if (search && !it.item_name.includes(search) && !it.category.includes(search))
      return false;
    return true;
  });

  return (
    <div className={className} style={{ marginTop: "24px" }}>
      {/* 标题栏 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "bold" }}>
          ⚠️ 库存预警
        </h3>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "#6b7280" }}>
            共 {items.length} 件 ·{" "}
            <span style={{ color: "#dc2626", fontWeight: 600 }}>
              {alertCount} 件预警
            </span>
            {criticalCount > 0 && (
              <>
                {" · "}
                <span style={{ color: "#b91c1c", fontWeight: 700 }}>
                  {criticalCount} 件严重(大仓无货)
                </span>
              </>
            )}
            {" · 缺口 "}{totalShortage}
            {" · "}{excludedCount} 件已排除
          </span>
          <button
            onClick={loadData}
            disabled={loading}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? "加载中..." : "🔄 刷新"}
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "12px",
          alignItems: "center",
        }}
      >
        {(
          [
            ["critical", `🔴 严重 (${criticalCount})`],
            ["alert", `⚠️ 预警 (${alertCount})`],
            ["all", `📋 全部 (${items.length})`],
            ["excluded", `🚫 已排除 (${excludedCount})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: filter === key ? 600 : 400,
              backgroundColor: filter === key ? (key === "critical" ? "#dc2626" : "#3b82f6") : "#f3f4f6",
              color: filter === key ? "white" : "#374151",
              border: "1px solid " + (filter === key ? (key === "critical" ? "#dc2626" : "#3b82f6") : "#d1d5db"),
              borderRadius: "16px",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
        <input
          type="text"
          placeholder="🔍 搜索商品名/分类"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            marginLeft: "auto",
            padding: "6px 10px",
            fontSize: "12px",
            border: "1px solid #d1d5db",
            borderRadius: "4px",
            width: "180px",
          }}
        />
      </div>

      {/* 错误提示 */}
      {error && (
        <div
          style={{
            padding: "12px",
            marginBottom: "12px",
            backgroundColor: "#fee2e2",
            border: "1px solid #ef4444",
            borderRadius: "4px",
            color: "#dc2626",
            fontSize: "13px",
          }}
        >
          ❌ {error}
        </div>
      )}

      {/* 数据来源 */}
      <div
        style={{
          padding: "6px 12px",
          marginBottom: "8px",
          fontSize: "12px",
          color: "#6b7280",
          display: "flex",
          gap: "16px",
        }}
      >
        <span>📊 前台: {frontFile || "无"}</span>
        <span>🏭 大仓: {whFile || "无"}</span>
        <span>默认阈值: {defaultThreshold}</span>
      </div>

      {/* 表格 */}
      <div
        style={{
          maxHeight: "480px",
          overflowY: "auto",
          border: "1px solid #e5e7eb",
          borderRadius: "8px",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "13px",
          }}
        >
          <thead>
            <tr
              style={{
                position: "sticky",
                top: 0,
                backgroundColor: "#f9fafb",
                zIndex: 1,
              }}
            >
              <th style={thStyle}>商品名</th>
              <th style={{ ...thStyle, width: "70px" }}>分类</th>
              <th style={{ ...thStyle, width: "70px", textAlign: "right" }}>
                前台
              </th>
              <th style={{ ...thStyle, width: "70px", textAlign: "right" }}>
                大仓
              </th>
              <th style={{ ...thStyle, width: "80px", textAlign: "center" }}>
                阈值
              </th>
              <th style={{ ...thStyle, width: "60px", textAlign: "right" }}>
                缺口
              </th>
              <th style={{ ...thStyle, width: "70px", textAlign: "center" }}>
                状态
              </th>
              <th style={{ ...thStyle, width: "70px", textAlign: "center" }}>
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  style={{ padding: "24px", textAlign: "center", color: "#6b7280" }}
                >
                  {loading ? "⏳ 加载中..." : "暂无数据"}
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const rowBg =
                  item.status === "excluded"
                    ? "#f9fafb"
                    : item.status === "critical"
                    ? "#fef2f2"
                    : item.status === "warning"
                    ? "#fffbeb"
                    : "#fff";

                return (
                  <tr
                    key={item.item_name}
                    style={{
                      backgroundColor: rowBg,
                      opacity: item.status === "excluded" ? 0.55 : 1,
                      borderBottom: "1px solid #f3f4f6",
                    }}
                  >
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500 }}>{item.item_name}</div>
                    </td>
                    <td style={{ ...tdStyle, color: "#6b7280", fontSize: "12px" }}>
                      {item.category || "-"}
                    </td>
                    {/* 前台库存 */}
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontWeight: 600,
                        color:
                          item.status === "excluded"
                            ? "#9ca3af"
                            : item.front_low
                            ? "#dc2626"
                            : "#059669",
                      }}
                    >
                      {item.front_stock}
                    </td>
                    {/* 大仓库存 */}
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontWeight: 600,
                        color:
                          item.status === "excluded"
                            ? "#9ca3af"
                            : item.wh_empty
                            ? "#dc2626"
                            : "#059669",
                      }}
                    >
                      {item.wh_stock}
                      {item.status === "excluded"
                        ? ""
                        : item.wh_empty && item.front_low
                        ? " ⚠️"
                        : ""}
                    </td>
                    {/* 阈值输入 */}
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <input
                        type="number"
                        min={0}
                        value={item.threshold}
                        disabled={item.status === "excluded"}
                        onChange={(e) =>
                          handleThresholdChange(
                            item.item_name,
                            Math.max(0, parseInt(e.target.value) || 0)
                          )
                        }
                        style={{
                          width: "56px",
                          padding: "4px 6px",
                          fontSize: "12px",
                          textAlign: "center",
                          border: "1px solid #d1d5db",
                          borderRadius: "4px",
                          backgroundColor:
                            item.status === "excluded" ? "#f3f4f6" : "#fff",
                          color:
                            savingItem === item.item_name ? "#3b82f6" : "#1f2937",
                        }}
                      />
                    </td>
                    {/* 缺口 */}
                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontWeight: 600,
                        color:
                          item.status === "excluded" || item.shortage === 0
                            ? "#9ca3af"
                            : "#dc2626",
                      }}
                    >
                      {item.status === "excluded"
                        ? "-"
                        : item.shortage > 0
                        ? item.shortage
                        : "✓"}
                    </td>
                    {/* 状态标签 */}
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      {item.status === "critical" ? (
                        <span style={statusBadge("#fee2e2", "#dc2626")}>
                          🔴 严重
                        </span>
                      ) : item.status === "warning" ? (
                        <span style={statusBadge("#fef3c7", "#d97706")}>
                          ⚠️ 低
                        </span>
                      ) : item.status === "excluded" ? (
                        <span style={statusBadge("#f3f4f6", "#9ca3af")}>
                          已排除
                        </span>
                      ) : (
                        <span style={statusBadge("#ecfdf5", "#059669")}>
                          ✓ 正常
                        </span>
                      )}
                    </td>
                    {/* 操作 */}
                    <td style={{ ...tdStyle, textAlign: "center" }}>
                      <button
                        onClick={() => handleToggleExclude(item)}
                        disabled={savingItem === item.item_name}
                        style={{
                          padding: "3px 10px",
                          fontSize: "11px",
                          fontWeight: 500,
                          backgroundColor:
                            item.status === "excluded" ? "#10b981" : "#ef4444",
                          color: "white",
                          border: "none",
                          borderRadius: "10px",
                          cursor:
                            savingItem === item.item_name
                              ? "not-allowed"
                              : "pointer",
                          opacity: savingItem === item.item_name ? 0.5 : 1,
                        }}
                      >
                        {savingItem === item.item_name
                          ? "..."
                          : item.status === "excluded"
                          ? "恢复"
                          : "排除"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 底部提示 */}
      <div
        style={{
          marginTop: "8px",
          fontSize: "11px",
          color: "#9ca3af",
          textAlign: "center",
        }}
      >
        💡 直接修改阈值数值自动保存 · 排除后停止预警 · 🔴严重=前台缺货+大仓无货
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontWeight: 600,
  fontSize: "12px",
  color: "#374151",
  borderBottom: "2px solid #e5e7eb",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
};

function statusBadge(bg: string, color: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "2px 8px",
    fontSize: "11px",
    fontWeight: 600,
    backgroundColor: bg,
    color,
    borderRadius: "10px",
    whiteSpace: "nowrap",
  };
}
