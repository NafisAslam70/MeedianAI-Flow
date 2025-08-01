"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import useSWR from "swr";

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function ManagersCommonDashboard({ disableUserSelect = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [totalTasks, setTotalTasks] = useState(0);
  const [completedTasks, setCompletedTasks] = useState(0);
  const [inProgressTasks, setInProgressTasks] = useState(0);
  const [notStartedTasks, setNotStartedTasks] = useState(0);
  const [pendingVerificationTasks, setPendingVerificationTasks] = useState(0);
  const [userFilter, setUserFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [groupByUser, setGroupByUser] = useState(false);
  const [groupByUpdated, setGroupByUpdated] = useState(false);
  const [groupByDeadline, setGroupByDeadline] = useState(false);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [users, setUsers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [latestUpdated, setLatestUpdated] = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [selectedSummaryCategory, setSelectedSummaryCategory] = useState(null);
  const [categoryTasks, setCategoryTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskLogs, setTaskLogs] = useState([]);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [unreadLogs, setUnreadLogs] = useState(new Set());
  const [newLogComment, setNewLogComment] = useState("");
  const [showAddLogModal, setShowAddLogModal] = useState(false);
  const [isAddingLog, setIsAddingLog] = useState(false);
  const [isReminding, setIsReminding] = useState({});
  const [selectedUserId, setSelectedUserId] = useState(null);

  const { data: usersData } = useSWR("/api/member/users", fetcher);
  const { data: dashboardData } = useSWR(`/api/managersCommon/dashboard?user=${userFilter}&status=${statusFilter}${selectedDate ? `&date=${selectedDate}` : ''}`, fetcher);

  const searchParams = useSearchParams();

  useEffect(() => {
    if (status === "authenticated" && !["admin", "team_manager"].includes(session?.user?.role)) {
      router.push("/dashboard/member");
    }
  }, [status, session, router]);

  useEffect(() => {
    if (disableUserSelect) {
      setSelectedUserId(null);
    }
  }, [disableUserSelect]);

  useEffect(() => {
    if (usersData?.users) {
      setUsers(usersData.users);
    }
  }, [usersData]);

  useEffect(() => {
    if (dashboardData) {
      const filteredTasks = dashboardData.assignedTasks || [];
      setTasks(filteredTasks);

      setTotalTasks(dashboardData.summaries?.totalTasks || 0);
      setCompletedTasks(dashboardData.summaries?.completedTasks || 0);
      setInProgressTasks(dashboardData.summaries?.inProgressTasks || 0);
      setNotStartedTasks(dashboardData.summaries?.notStartedTasks || 0);
      setPendingVerificationTasks(dashboardData.summaries?.pendingVerificationTasks || 0);

      setLatestUpdated(dashboardData.latestUpdated || []);
      setRecentLogs(dashboardData.recentLogs || []);

      const unread = new Set();
      (dashboardData.recentLogs || []).forEach(log => {
        if (!localStorage.getItem(`viewed_${log.id}`)) {
          unread.add(log.taskId);
        }
      });
      setUnreadLogs(unread);
    }
  }, [dashboardData]);

  useEffect(() => {
    const handleOpenTask = async (e) => {
      const { taskId, sprintId } = e.detail;
      const task = await fetchTask(taskId);
      if (task) {
        handleViewTaskDetails(task);
        // TODO: If sprintId is provided, you can add logic to highlight or scroll to the specific sprint in the modal
      } else {
        setError("Task not found");
      }
    };

    window.addEventListener("member-open-task", handleOpenTask);
    return () => window.removeEventListener("member-open-task", handleOpenTask);
  }, []);

  useEffect(() => {
    const focusTask = searchParams.get("focusTask");
    const focusSprint = searchParams.get("focusSprint");

    if (focusTask) {
      const openFocusedTask = async () => {
        const task = await fetchTask(Number(focusTask));
        if (task) {
          handleViewTaskDetails(task);
          // TODO: If focusSprint is provided, you can add logic to highlight or scroll to the specific sprint in the modal
        } else {
          setError("Task not found");
        }
      };
      openFocusedTask();
    }
  }, [searchParams]);

  const getStatusColor = (status) => {
    switch (status) {
      case "not_started": return "bg-red-100 text-red-800";
      case "in_progress": return "bg-yellow-100 text-yellow-800";
      case "pending_verification": return "bg-blue-100 text-blue-800";
      case "done": case "verified": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getUserName = (userId) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      return user.name + (userId === Number(session?.user?.id) ? " (you)" : "");
    } else if (userId === Number(session?.user?.id)) {
      return session?.user?.name + " (you)";
    } else {
      return "Unknown";
    }
  };

  const groupedTasks = () => {
    if (!groupByUser) return null;
    const groups = {};
    tasks.forEach(task => {
      task.assignees.forEach(assignee => {
        const groupId = assignee.id;
        if (!groups[groupId]) groups[groupId] = [];
        if (!groups[groupId].some(t => t.id === task.id)) {
          groups[groupId].push(task);
        }
      });
    });
    return groups;
  };

  const groupedLatestUpdated = () => {
    if (!groupByUpdated) return null;
    const groups = {};
    latestUpdated.forEach(task => {
      task.assignees.forEach(assignee => {
        const groupId = assignee.id;
        if (!groups[groupId]) groups[groupId] = [];
        if (!groups[groupId].some(t => t.id === task.id)) {
          groups[groupId].push(task);
        }
      });
    });
    return groups;
  };

  const groupedDeadlineApproaching = () => {
    if (!groupByDeadline) return null;
    const groups = {};
    approachingDeadlines.forEach(task => {
      task.assignees.forEach(assignee => {
        const groupId = assignee.id;
        if (!groups[groupId]) groups[groupId] = [];
        if (!groups[groupId].some(t => t.id === task.id)) {
          groups[groupId].push(task);
        }
      });
    });
    return groups;
  };

  const handleRemindUser = async (taskId, userIds, taskTitle) => {
    setIsReminding(prev => ({ ...prev, [taskId]: true }));
    try {
      const logsRes = await fetch(`/api/member/assignedTasks?taskId=${taskId}&action=logs`);
      if (!logsRes.ok) {
        throw new Error(`Failed to fetch logs: ${logsRes.statusText}`);
      }
      const logsData = await logsRes.json();
      const latestLog = logsData.logs?.[0]?.details || "No recent updates";
      await Promise.all(
        userIds.map(async (userId) => {
          const recipientName = getUserName(userId);
          const message = `Hi ${recipientName}, please update me (${latestLog}) for this task "${taskTitle}" [task:${taskId}] :) Thank you`;
          const res = await fetch("/api/others/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: session?.user?.id,
              recipientId: userId,
              message,
            }),
          });
          if (!res.ok) {
            throw new Error(`Failed to send chat message to user ${userId}`);
          }
        })
      );
      console.log(`Reminder sent for task ${taskId}`);
    } catch (err) {
      setError("Error sending reminder");
      console.error(err);
    } finally {
      setIsReminding(prev => ({ ...prev, [taskId]: false }));
    }
  };

  const handleAddLog = async (taskId, notifyAssignees = false) => {
    if (!newLogComment) {
      setError("Log comment cannot be empty");
      return;
    }
    setIsAddingLog(true);
    try {
      const response = await fetch(`/api/member/assignedTasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          action: "log_added",
          details: newLogComment,
        }),
      });
      if (response.ok) {
        const { log } = await response.json();
        setRecentLogs(prev => [
          { ...log, userId: session?.user?.id, userName: session?.user?.name },
          ...prev.slice(0, 4)
        ]);
        setTaskLogs(prev => [
          { ...log, userId: session?.user?.id, userName: session?.user?.name },
          ...prev
        ]);
        setNewLogComment("");
        setShowAddLogModal(false);

        if (notifyAssignees) {
          const task = tasks.find(t => t.id === taskId);
          if (task) {
            const message = `Log added to task "${task.title}" by ${getUserName(session?.user?.id)}: ${newLogComment} [task:${taskId}]`;
            await Promise.all(
              task.assignees.map(a => a.id).filter(id => id !== session?.user?.id).map(userId =>
                fetch("/api/others/chat", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    userId: session?.user?.id,
                    recipientId: userId,
                    message,
                  }),
                })
              )
            );
          }
        }
      } else {
        setError("Failed to add log");
      }
    } catch (err) {
      setError("Error adding log");
      console.error(err);
    } finally {
      setIsAddingLog(false);
    }
  };

  const handleVerifyTask = async (taskId) => {
    if (!newLogComment) {
      setError("Comment required for verification");
      return;
    }
    setIsAddingLog(true);
    try {
      const response = await fetch(`/api/member/assignedTasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          status: "verified",
          action: "update_task",
          notifyAssignees: true,
          notifyWhatsapp: false,
          newLogComment,
          memberId: session?.user?.id,
        }),
      });
      if (response.ok) {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "verified" } : t));
        setLatestUpdated(prev => prev.map(t => t.id === taskId ? { ...t, status: "verified" } : t));
        setTaskLogs(prev => [
          { id: Date.now(), userId: session?.user?.id, userName: session?.user?.name, action: "status_update", details: newLogComment, createdAt: new Date() },
          ...prev
        ]);
        setNewLogComment("");
      } else {
        setError("Failed to verify task");
      }
    } catch (err) {
      setError("Error verifying task");
      console.error(err);
    } finally {
      setIsAddingLog(false);
    }
  };

  const fetchTask = async (taskId) => {
    try {
      const res = await fetch(`/api/member/assignedTasks?action=task&taskId=${taskId}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch task: ${res.statusText}`);
      }
      const data = await res.json();
      return data.task || null;
    } catch (err) {
      setError("Failed to fetch task");
      console.error(err);
      return null;
    }
  };

  const handleViewTaskDetails = async (task) => {
    setSelectedTask(task);
    try {
      const logsRes = await fetch(`/api/member/assignedTasks?taskId=${task.id}&action=logs`);
      if (!logsRes.ok) {
        throw new Error(`Failed to fetch logs: ${logsRes.statusText}`);
      }
      const logsData = await logsRes.json();
      const logs = logsData.logs || [];
      setTaskLogs(logs);
      if (Array.isArray(logs)) {
        logs.forEach(log => localStorage.setItem(`viewed_${log.id}`, true));
      }
      setUnreadLogs(prev => {
        const newSet = new Set(prev);
        newSet.delete(task.id);
        return newSet;
      });
    } catch (err) {
      setError("Failed to fetch task logs");
      console.error(err);
    }
    setShowDetailsModal(true);
  };

  const handleViewLog = async (log) => {
    let task = tasks.find(t => t.id === log.taskId);
    if (!task) {
      task = await fetchTask(log.taskId);
    }
    if (task) {
      handleViewTaskDetails(task);
    } else {
      setError("Task not found");
    }
  };

  const handleSummaryClick = (category) => {
    let filtered = [];
    switch (category) {
      case "total":
        filtered = tasks;
        break;
      case "completed":
        filtered = tasks.filter(t => t.status === "done" || t.status === "verified");
        break;
      case "in_progress":
        filtered = tasks.filter(t => t.status === "in_progress");
        break;
      case "pending_verification":
        filtered = tasks.filter(t => t.status === "pending_verification");
        break;
      case "not_started":
        filtered = tasks.filter(t => t.status === "not_started");
        break;
    }
    setCategoryTasks(filtered);
    setSelectedSummaryCategory(category);
    setShowSummaryModal(true);
  };

  const handleBack = () => {
    if (session?.user?.role === "admin") {
      router.push("/dashboard/admin");
    } else {
      router.push("/dashboard/team_manager");
    }
  };

  if (status === "loading") {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xl font-semibold text-gray-600"
        >
          Loading...
        </motion.div>
      </div>
    );
  }

  const approachingDeadlines = tasks
    .filter(t => t.deadline && new Date(t.deadline) > new Date() && new Date(t.deadline) < new Date(new Date().getTime() + 3 * 24 * 60 * 60 * 1000) && t.status !== "done" && t.status !== "verified")
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 10);

  const viewedUser = users.find(u => u.id === selectedUserId);

  if (selectedUserId) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-0 bg-gradient-to-br from-blue-50 to-indigo-50 p-8 flex items-center justify-center"
      >
        <div className="w-full h-full bg-white rounded-2xl shadow-2xl p-8 flex flex-col gap-8 overflow-y-auto">
          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-4 left-4 right-4 text-red-600 text-sm font-medium bg-red-50 p-4 rounded-lg shadow-md"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Dashboard Header for User View */}
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedUserId(null)}
                className="mr-4 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 text-sm shadow-md transition-all duration-200"
              >
                Back to Managers Dashboard
              </motion.button>
              <h1 className="text-3xl font-bold text-indigo-800">{viewedUser?.name}'s Dashboard</h1>
            </div>
            <div className="flex items-center space-x-6">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : null)}
                className="px-4 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm bg-white shadow-sm"
              >
                <option value="">Select User</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm bg-white shadow-sm"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setGroupByUser(!groupByUser)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm shadow-md transition-all duration-200"
              >
                {groupByUser ? "Ungroup by User" : "Group by User"}
              </motion.button>
              <div className="relative">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm shadow-md transition-all duration-200"
                >
                  Filters
                </motion.button>
                <AnimatePresence>
                  {showFilterDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-2xl p-6 z-20 border border-indigo-200"
                    >
                      <div className="space-y-6">
                        <div>
                          <p className="text-sm font-semibold text-indigo-700 mb-2">User</p>
                          <select
                            value={userFilter}
                            onChange={(e) => setUserFilter(e.target.value)}
                            className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm bg-indigo-50 focus:ring-2 focus:ring-indigo-500 transition-all duration-200"
                          >
                            <option value="all">All Users</option>
                            {users.map(user => (
                              <option key={user.id} value={user.id}>{user.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-indigo-700 mb-2">Status</p>
                          <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm bg-indigo-50 focus:ring-2 focus:ring-indigo-500 transition-all duration-200"
                          >
                            <option value="all">All Statuses</option>
                            <option value="not_started">Not Started</option>
                            <option value="in_progress">In Progress</option>
                            <option value="pending_verification">Pending Verification</option>
                            <option value="done">Done/Verified</option>
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
          <PersonalView userId={selectedUserId} />
        </div>
      </motion.div>
    );
  } else {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-0 bg-gradient-to-br from-blue-50 to-indigo-50 p-8 flex items-center justify-center"
      >
        <div className="w-full h-full bg-white rounded-2xl shadow-2xl p-8 flex flex-col gap-8 overflow-y-auto">
          {/* Error Message */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-4 left-4 right-4 text-red-600 text-sm font-medium bg-red-50 p-4 rounded-lg shadow-md"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Dashboard Header */}
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              {session?.user?.role !== "admin" && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleBack}
                  className="mr-4 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 text-sm shadow-md transition-all duration-200"
                >
                  Back
                </motion.button>
              )}
              <h1 className="text-3xl font-bold text-indigo-800">Task Tracking Dashboard</h1>
            </div>
            <div className="flex items-center space-x-6">
              {session?.user?.role === "admin" && !disableUserSelect && (
                <select
                  value={selectedUserId || ""}
                  onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : null)}
                  className="px-4 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm bg-white shadow-sm"
                >
                  <option value="">Select User to View Dashboard</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
              )}
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-4 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm bg-white shadow-sm"
              />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setGroupByUser(!groupByUser)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm shadow-md transition-all duration-200"
              >
                {groupByUser ? "Ungroup by User" : "Group by User"}
              </motion.button>
              <div className="relative">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm shadow-md transition-all duration-200"
                >
                  Filters
                </motion.button>
                <AnimatePresence>
                  {showFilterDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-2xl p-6 z-20 border border-indigo-200"
                    >
                      <div className="space-y-6">
                        <div>
                          <p className="text-sm font-semibold text-indigo-700 mb-2">User</p>
                          <select
                            value={userFilter}
                            onChange={(e) => setUserFilter(e.target.value)}
                            className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm bg-indigo-50 focus:ring-2 focus:ring-indigo-500 transition-all duration-200"
                          >
                            <option value="all">All Users</option>
                            {users.map(user => (
                              <option key={user.id} value={user.id}>{user.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-indigo-700 mb-2">Status</p>
                          <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm bg-indigo-50 focus:ring-2 focus:ring-indigo-500 transition-all duration-200"
                          >
                            <option value="all">All Statuses</option>
                            <option value="not_started">Not Started</option>
                            <option value="in_progress">In Progress</option>
                            <option value="pending_verification">Pending Verification</option>
                            <option value="done">Done/Verified</option>
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Task Overview - Clickable Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-6">
            <motion.div whileHover={{ scale: 1.05 }} onClick={() => handleSummaryClick("total")} className="cursor-pointer text-center p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-md border border-indigo-200 transition-all duration-200">
              <p className="text-base font-medium text-indigo-700">Total Tasks</p>
              <p className="text-3xl font-bold text-indigo-800">{totalTasks}</p>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} onClick={() => handleSummaryClick("completed")} className="cursor-pointer text-center p-6 bg-gradient-to-r from-green-50 to-green-100 rounded-lg shadow-md border border-green-200 transition-all duration-200">
              <p className="text-base font-medium text-green-700">Completed</p>
              <p className="text-3xl font-bold text-green-800">{completedTasks}</p>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} onClick={() => handleSummaryClick("in_progress")} className="cursor-pointer text-center p-6 bg-gradient-to-r from-yellow-50 to-yellow-100 rounded-lg shadow-md border border-yellow-200 transition-all duration-200">
              <p className="text-base font-medium text-yellow-700">In Progress</p>
              <p className="text-3xl font-bold text-yellow-800">{inProgressTasks}</p>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} onClick={() => handleSummaryClick("pending_verification")} className="cursor-pointer text-center p-6 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg shadow-md border border-blue-200 transition-all duration-200">
              <p className="text-base font-medium text-blue-700">Pending Verification</p>
              <p className="text-3xl font-bold text-blue-800">{pendingVerificationTasks}</p>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} onClick={() => handleSummaryClick("not_started")} className="cursor-pointer text-center p-6 bg-gradient-to-r from-red-50 to-red-100 rounded-lg shadow-md border border-red-200 transition-all duration-200">
              <p className="text-base font-medium text-red-700">Not Started</p>
              <p className="text-3xl font-bold text-red-800">{notStartedTasks}</p>
            </motion.div>
          </div>

          {/* Recent Activity Logs Carousel */}
          <div>
            <h2 className="text-xl font-bold text-indigo-800 mb-4">Latest Activity Logs</h2>
            <div className="overflow-x-auto whitespace-nowrap pb-4">
              {recentLogs.map((log) => (
                <motion.div
                  key={log.id}
                  className="inline-block w-96 bg-white rounded-lg shadow-md p-6 mr-6 cursor-pointer relative border border-indigo-100 transition-all duration-200 hover:shadow-lg"
                  whileHover={{ scale: 1.05 }}
                >
                  {!localStorage.getItem(`viewed_${log.id}`) && (
                    <span className="absolute top-4 right-4 w-3 h-3 bg-red-500 rounded-full"></span>
                  )}
                  <div className="flex flex-col h-full">
                    <p className="text-base text-indigo-700 font-medium mb-3">
                      {log.userName || getUserName(log.userId)} {log.action} task {log.taskId}:
                    </p>
                    <p className="text-sm text-gray-700 mb-3">{log.details}</p>
                    <p className="text-sm text-indigo-600 mb-3">Assignees: {tasks.find(t => t.id === log.taskId)?.assignees.map(a => a.name).join(", ") || "N/A"}</p>
                    <p className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString()}</p>
                    <div className="flex justify-end mt-auto">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleViewLog(log)}
                        className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm hover:bg-indigo-200 transition-all duration-200"
                      >
                        Details
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Two Columns: Latest Updated and Deadline Approaching */}
          <div className="grid grid-cols-2 gap-10">
            <div className="border border-indigo-200 rounded-lg p-6 shadow-md bg-white">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-indigo-800">Latest Updated Tasks</h2>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setGroupByUpdated(!groupByUpdated)}
                  className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm hover:bg-indigo-200 transition-all duration-200 shadow-sm"
                >
                  {groupByUpdated ? "Ungroup by User" : "Group by User"}
                </motion.button>
              </div>
              {groupByUpdated ? (
                Object.entries(groupedLatestUpdated() || {}).map(([userId, userTasks]) => (
                  <div key={userId} className="mb-6">
                    <h3 className="text-lg font-semibold text-indigo-700 mb-3">{getUserName(parseInt(userId))}</h3>
                    <div className="space-y-4">
                      {userTasks.map((task, index) => (
                        <motion.div
                          key={`${task.id}-${index}`}
                          className="bg-indigo-50 rounded-lg shadow-sm p-5 border border-indigo-200 transition-all duration-200"
                          whileHover={{ scale: 1.02 }}
                        >
                          <p className="text-base text-indigo-800 truncate">{task.title}</p>
                          <p className="text-sm text-indigo-600">Assignees: {task.assignees.map(a => a.name).join(", ")}</p>
                          <span className={`text-sm px-3 py-1 rounded-full ${getStatusColor(task.status)}`}>
                            {task.status?.replace("_", " ") || "Unknown"}
                          </span>
                          <div className="flex gap-3 mt-3">
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleViewTaskDetails(task)}
                              className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-all duration-200"
                            >
                              Details
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleRemindUser(task.id, task.assignees.map(a => a.id), task.title)}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-all duration-200 relative"
                            >
                              {isReminding[task.id] ? (
                                <motion.span
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                  className="inline-block w-4 h-4 border-2 border-t-indigo-200 border-indigo-600 rounded-full"
                                />
                              ) : "Remind"}
                            </motion.button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  {latestUpdated.map((task) => (
                    <motion.div
                      key={task.id}
                      className="bg-indigo-50 rounded-lg shadow-sm p-5 border border-indigo-200 transition-all duration-200"
                      whileHover={{ scale: 1.02 }}
                    >
                      <p className="text-base text-indigo-800 truncate">{task.title}</p>
                      <p className="text-sm text-indigo-600">Assignees: {task.assignees.map(a => a.name).join(", ")}</p>
                      <span className={`text-sm px-3 py-1 rounded-full ${getStatusColor(task.status)}`}>
                        {task.status?.replace("_", " ") || "Unknown"}
                      </span>
                      <div className="flex gap-3 mt-3">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleViewTaskDetails(task)}
                          className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-all duration-200"
                        >
                          Details
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleRemindUser(task.id, task.assignees.map(a => a.id), task.title)}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-all duration-200 relative"
                        >
                          {isReminding[task.id] ? (
                            <motion.span
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              className="inline-block w-4 h-4 border-2 border-t-indigo-200 border-indigo-600 rounded-full"
                            />
                          ) : "Remind"}
                        </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
            <div className="border border-indigo-200 rounded-lg p-6 shadow-md bg-white">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-indigo-800">Deadline Approaching Tasks</h2>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setGroupByDeadline(!groupByDeadline)}
                  className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm hover:bg-indigo-200 transition-all duration-200 shadow-sm"
                >
                  {groupByDeadline ? "Ungroup by User" : "Group by User"}
                </motion.button>
              </div>
              {groupByDeadline ? (
                Object.entries(groupedDeadlineApproaching() || {}).map(([userId, userTasks]) => (
                  <div key={userId} className="mb-6">
                    <h3 className="text-lg font-semibold text-indigo-700 mb-3">{getUserName(parseInt(userId))}</h3>
                    <div className="space-y-4">
                      {userTasks.map((task, index) => (
                        <motion.div
                          key={`${task.id}-${index}`}
                          className="bg-indigo-50 rounded-lg shadow-sm p-5 border border-indigo-200 transition-all duration-200"
                          whileHover={{ scale: 1.02 }}
                        >
                          <p className="text-base text-indigo-800 truncate">{task.title}</p>
                          <p className="text-sm text-indigo-600">Assignees: {task.assignees.map(a => a.name).join(", ")}</p>
                          <span className={`text-sm px-3 py-1 rounded-full ${getStatusColor(task.status)}`}>
                            {task.status?.replace("_", " ") || "Unknown"}
                          </span>
                          <div className="flex gap-3 mt-3">
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleViewTaskDetails(task)}
                              className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-all duration-200"
                            >
                              Details
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleRemindUser(task.id, task.assignees.map(a => a.id), task.title)}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-all duration-200 relative"
                            >
                              {isReminding[task.id] ? (
                                <motion.span
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                  className="inline-block w-4 h-4 border-2 border-t-indigo-200 border-indigo-600 rounded-full"
                                />
                              ) : "Remind"}
                            </motion.button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  {approachingDeadlines.map((task) => (
                    <motion.div
                      key={task.id}
                      className="bg-indigo-50 rounded-lg shadow-sm p-5 border border-indigo-200 transition-all duration-200"
                      whileHover={{ scale: 1.02 }}
                    >
                      <p className="text-base text-indigo-800 truncate">{task.title}</p>
                      <p className="text-sm text-indigo-600">Assignees: {task.assignees.map(a => a.name).join(", ")}</p>
                      <span className={`text-sm px-3 py-1 rounded-full ${getStatusColor(task.status)}`}>
                        {task.status?.replace("_", " ") || "Unknown"}
                      </span>
                      <div className="flex gap-3 mt-3">
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleViewTaskDetails(task)}
                          className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-all duration-200"
                        >
                          Details
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleRemindUser(task.id, task.assignees.map(a => a.id), task.title)}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-all duration-200 relative"
                        >
                          {isReminding[task.id] ? (
                            <motion.span
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              className="inline-block w-4 h-4 border-2 border-t-indigo-200 border-indigo-600 rounded-full"
                            />
                          ) : "Remind"}
                        </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Grouped by User */}
          {groupByUser && (
            <div>
              <h2 className="text-xl font-bold text-indigo-800 mb-4">Tasks Grouped by User</h2>
              {Object.entries(groupedTasks() || {}).map(([userId, userTasks]) => (
                <div key={userId} className="mb-6">
                  <h3 className="text-lg font-semibold text-indigo-700 mb-3">{getUserName(parseInt(userId))}</h3>
                  <div className="space-y-4">
                    {userTasks.map((task, index) => (
                      <motion.div
                        key={`${task.id}-${index}`}
                        className="bg-indigo-50 rounded-lg shadow-sm p-5 border border-indigo-200 transition-all duration-200"
                        whileHover={{ scale: 1.02 }}
                      >
                        <p className="text-base text-indigo-800 truncate">{task.title}</p>
                        <span className={`text-sm px-3 py-1 rounded-full ${getStatusColor(task.status)}`}>
                          {task.status?.replace("_", " ") || "Unknown"}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Task Details Modal */}
          <AnimatePresence>
            {showDetailsModal && selectedTask && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50"
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-white rounded-2xl p-8 w-full max-w-5xl overflow-y-auto max-h-[85vh] shadow-2xl border border-indigo-200"
                >
                  <h2 className="text-xl font-bold text-indigo-800 mb-6">{selectedTask.title}</h2>
                  <div className="flex flex-row gap-8 mb-6">
                    <div className="flex-1 space-y-5">
                      <p className="text-base"><strong className="text-indigo-700">Description:</strong> {selectedTask.description || "N/A"}</p>
                      <div className="mt-6">
                        <h3 className="text-lg font-semibold text-indigo-700">Assignees</h3>
                        {selectedTask.assignees.map((assignee, index) => (
                          <div key={`${assignee.id}-${index}`} className="mt-4 bg-indigo-50 p-5 rounded-lg shadow-sm border border-indigo-200">
                            <p className="text-base"><strong className="text-indigo-700">Name:</strong> {assignee.name}</p>
                            <p className="text-base"><strong className="text-indigo-700">Status:</strong> {selectedTask.status?.replace("_", " ") || "Unknown"}</p>
                            {assignee.sprints && assignee.sprints.length > 0 && (
                              <div className="mt-2">
                                <h4 className="text-base font-semibold text-indigo-700">Sprints</h4>
                                {assignee.sprints.map(sprint => (
                                  <div key={sprint.id} className="mt-2 bg-white p-3 rounded shadow-sm border border-indigo-100">
                                    <p className="text-sm"><strong>{sprint.title || "Untitled Sprint"}:</strong> {sprint.description || "N/A"}</p>
                                    <p className="text-sm">Status: {sprint.status?.replace("_", " ") || "Unknown"}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <p className="text-base"><strong className="text-indigo-700">Deadline:</strong> {selectedTask.deadline ? new Date(selectedTask.deadline).toLocaleString() : "N/A"}</p>
                      <p className="text-base"><strong className="text-indigo-700">Resources:</strong> {selectedTask.resources || "N/A"}</p>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-indigo-700 mb-4">Logs</h3>
                      <div className="max-h-80 overflow-y-auto space-y-4 mb-6">
                        {taskLogs.length > 0 ? (
                          taskLogs.map(log => (
                            <div key={log.id} className="p-5 bg-indigo-50 rounded-lg shadow-sm border border-indigo-200 transition-all duration-200">
                              <p className="text-base text-indigo-800">{log.userName || getUserName(log.userId)}: {log.details}</p>
                              <p className="text-sm text-gray-500 mt-2">{new Date(log.createdAt).toLocaleString()}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-base text-gray-500">No logs available.</p>
                        )}
                      </div>
                      <div className="mt-6">
                        <h4 className="text-base font-semibold text-indigo-700 mb-3">Add New Log</h4>
                        <textarea
                          value={newLogComment}
                          onChange={(e) => setNewLogComment(e.target.value)}
                          placeholder="Add a comment to the task discussion..."
                          className="w-full px-4 py-3 border border-indigo-300 rounded-lg bg-indigo-50 focus:ring-2 focus:ring-indigo-500 text-sm font-medium text-gray-700 mb-4 transition-all duration-200"
                        />
                        {selectedTask.assignees.some(a => a.status === "pending_verification") && (
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleVerifyTask(selectedTask.id)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-all duration-200 mr-3 relative"
                            disabled={!newLogComment || isAddingLog}
                          >
                            {isAddingLog ? (
                              <motion.span
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                className="inline-block w-4 h-4 border-2 border-t-green-200 border-green-600 rounded-full"
                              />
                            ) : "Verify Task"}
                          </motion.button>
                        )}
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleAddLog(selectedTask.id, true)}
                          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-all duration-200 relative"
                          disabled={!newLogComment || isAddingLog}
                        >
                          {isAddingLog ? (
                            <motion.span
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              className="inline-block w-4 h-4 border-2 border-t-indigo-200 border-indigo-600 rounded-full"
                            />
                          ) : "Add Log & Notify Assignees"}
                        </motion.button>
                      </div>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowDetailsModal(false)}
                    className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all duration-200 shadow-md"
                  >
                    Close
                  </motion.button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Add Log Modal (for Latest Activity Logs) */}
          <AnimatePresence>
            {showAddLogModal && selectedTask && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50"
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-white rounded-2xl p-8 w-full max-w-lg shadow-2xl border border-indigo-200"
                >
                  <h2 className="text-xl font-bold text-indigo-800 mb-6">Add Log for {selectedTask.title}</h2>
                  <textarea
                    value={newLogComment}
                    onChange={(e) => setNewLogComment(e.target.value)}
                    placeholder="Add a comment to the task discussion..."
                    className="w-full px-4 py-3 border border-indigo-300 rounded-lg bg-indigo-50 focus:ring-2 focus:ring-indigo-500 text-sm font-medium text-gray-700 mb-4 transition-all duration-200"
                  />
                  <div className="flex justify-end space-x-3">
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowAddLogModal(false)}
                      className="px-4 py-2 bg-gray-500 text-white rounded-lg text-sm hover:bg-gray-600 transition-all duration-200"
                    >
                      Cancel
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleAddLog(selectedTask.id, true)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-all duration-200 relative"
                      disabled={!newLogComment || isAddingLog}
                    >
                      {isAddingLog ? (
                        <motion.span
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          className="inline-block w-4 h-4 border-2 border-t-indigo-200 border-indigo-600 rounded-full"
                        />
                      ) : "Add Log & Notify Assignees"}
                    </motion.button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Summary Modal */}
          <AnimatePresence>
            {showSummaryModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50"
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-white rounded-2xl p-8 w-full max-w-5xl overflow-y-auto max-h-[85vh] shadow-2xl border border-indigo-200"
                >
                  <h2 className="text-xl font-bold text-indigo-800 mb-6">Tasks in {selectedSummaryCategory.toUpperCase()}</h2>
                  <div className="space-y-6">
                    {categoryTasks.map((task) => (
                      <motion.div
                        key={task.id}
                        className="bg-indigo-50 rounded-lg shadow-md p-6 border border-indigo-200 transition-all duration-200"
                        whileHover={{ scale: 1.02 }}
                      >
                        <p className="text-base text-indigo-800 truncate">{task.title}</p>
                        <p className="text-sm text-indigo-600">Assignees: {task.assignees.map(a => a.name).join(", ")}</p>
                        <span className={`text-sm px-3 py-1 rounded-full ${getStatusColor(task.status)}`}>
                          {task.status?.replace("_", " ") || "Unknown"}
                        </span>
                        <div className="flex gap-3 mt-4">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setShowSummaryModal(false);
                              handleViewTaskDetails(task);
                            }}
                            className="px-4 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-all duration-200"
                          >
                            Details
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleRemindUser(task.id, task.assignees.map(a => a.id), task.title)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-all duration-200 relative"
                          >
                            {isReminding[task.id] ? (
                              <motion.span
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                                className="inline-block w-4 h-4 border-2 border-t-indigo-200 border-indigo-600 rounded-full"
                              />
                            ) : "Remind"}
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowSummaryModal(false)}
                    className="mt-6 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all duration-200 shadow-md"
                  >
                    Close
                  </motion.button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }
}