import { useEffect, useState } from 'react';

export const NEWS_CATEGORIES = ['Thông báo', 'Nghỉ học', 'Lịch học bù', 'Học vụ', 'Sự kiện', 'Khác'];

const initialForm = {
  title: '',
  summary: '',
  content: '',
  category: NEWS_CATEGORIES[0],
  status: 'published',
  isImportant: false
};

export default function NewsForm({ currentNews, onSubmit, onCancel }) {
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (currentNews) {
      setForm({
        title: currentNews.title || '',
        summary: currentNews.summary || '',
        content: currentNews.content || '',
        category: currentNews.category || NEWS_CATEGORIES[0],
        status: currentNews.status === 'draft' ? 'draft' : 'published',
        isImportant: Number(currentNews.isImportant) === 1
      });
      return;
    }
    setForm(initialForm);
  }, [currentNews]);

  function handleChange(event) {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    await onSubmit({
      ...form,
      title: form.title.trim(),
      summary: form.summary.trim(),
      content: form.content.trim(),
      isImportant: form.isImportant ? 1 : 0
    });
    // Sau khi đăng mới thì xóa form; khi đang sửa, Dashboard sẽ tự reset qua currentNews = null
    if (!currentNews) setForm(initialForm);
  }

  const categories = NEWS_CATEGORIES.includes(form.category)
    ? NEWS_CATEGORIES
    : [...NEWS_CATEGORIES, form.category];

  return (
    <div className="card">
      <div className="card-header">
        <h3>{currentNews ? 'Cập nhật tin tức' : 'Đăng tin tức mới'}</h3>
        <p>Thông báo nghỉ học, lịch học bù hoặc nội dung học vụ cho giảng viên và sinh viên.</p>
      </div>

      <form className="grid-form" onSubmit={handleSubmit}>
        <input
          className="span-2"
          name="title"
          placeholder="Tiêu đề tin tức"
          value={form.title}
          onChange={handleChange}
          required
        />

        <input
          className="span-2"
          name="summary"
          placeholder="Mô tả ngắn (không bắt buộc)"
          value={form.summary}
          onChange={handleChange}
        />

        <textarea
          className="span-2"
          name="content"
          rows="6"
          placeholder="Nội dung chi tiết"
          value={form.content}
          onChange={handleChange}
          required
        />

        <select name="category" value={form.category} onChange={handleChange}>
          {categories.map((category) => (
            <option key={category} value={category}>{category}</option>
          ))}
        </select>

        <select name="status" value={form.status} onChange={handleChange}>
          <option value="published">Đăng ngay</option>
          <option value="draft">Lưu bản nháp</option>
        </select>

        <label className="checkbox-row span-2">
          <input
            type="checkbox"
            name="isImportant"
            checked={form.isImportant}
            onChange={handleChange}
          />
          <span>Đánh dấu là tin quan trọng (luôn hiển thị đầu danh sách)</span>
        </label>

        <div className="form-actions">
          <button className="btn btn-primary" type="submit">
            {currentNews ? 'Lưu tin tức' : 'Đăng tin tức'}
          </button>
          {currentNews && (
            <button className="btn btn-light" type="button" onClick={onCancel}>
              Hủy sửa
            </button>
          )}
        </div>
      </form>
    </div>
  );
}