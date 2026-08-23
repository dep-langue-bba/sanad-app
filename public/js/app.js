document.addEventListener('DOMContentLoaded', () => {
    // -----------------------------------------------------------------
    // 1. التبديل بين التبويبات (Tabs Navigation)
    // -----------------------------------------------------------------
    const tabNewReport = document.getElementById('tabNewReport');
    const tabCheckStatus = document.getElementById('tabCheckStatus');
    const sectionNewReport = document.getElementById('sectionNewReport');
    const sectionCheckStatus = document.getElementById('sectionCheckStatus');
    const responseBox = document.getElementById('responseBox');

    tabNewReport.addEventListener('click', () => {
        sectionNewReport.style.display = 'block';
        sectionCheckStatus.style.display = 'none';
        
        tabNewReport.style.background = 'var(--primary-emerald)';
        tabNewReport.style.color = '#ffffff';
        tabCheckStatus.style.background = 'transparent';
        tabCheckStatus.style.color = 'var(--text-charcoal)';
        
        responseBox.innerHTML = '';
    });

    tabCheckStatus.addEventListener('click', () => {
        sectionNewReport.style.display = 'none';
        sectionCheckStatus.style.display = 'block';
        
        tabCheckStatus.style.background = 'var(--primary-emerald)';
        tabCheckStatus.style.color = '#ffffff';
        tabNewReport.style.background = 'transparent';
        tabNewReport.style.color = 'var(--text-charcoal)';
        
        responseBox.innerHTML = '';
    });

    // -----------------------------------------------------------------
    // 2. التحكم الديناميكي بحقول الوثائق الإدارية (Dynamic UI)
    // -----------------------------------------------------------------
    const categorySelect = document.getElementById('category');
    const subCategoryGroup = document.getElementById('subCategoryGroup');
    const lblModule = document.getElementById('lblModule');
    const lblRoom = document.getElementById('lblRoom');

    categorySelect.addEventListener('change', (e) => {
        if (e.target.value === 'DOC_REQUEST') {
            subCategoryGroup.style.display = 'block';
            lblModule.textContent = 'المقياس / السداسي المعني (اختياري)';
            lblRoom.textContent = 'المجموعة / الأفواج (اختياري)';
        } else {
            subCategoryGroup.style.display = 'none';
            lblModule.textContent = 'المادة / المقياس';
            lblRoom.textContent = 'القاعة / المدرج';
        }
    });

    // -----------------------------------------------------------------
    // 3. إرسال طلب جديد مع المرفقات (Submit Form via FormData)
    // -----------------------------------------------------------------
    const reportForm = document.getElementById('reportForm');

    reportForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        responseBox.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 10px;">جاري إرسال الطلب وتشفير البيانات...</div>';

        const formData = new FormData();
        formData.append('category', document.getElementById('category').value);
        formData.append('sub_category', document.getElementById('sub_category').value);
        formData.append('module_code', document.getElementById('module_code').value);
        formData.append('room', document.getElementById('room').value);
        formData.append('details', document.getElementById('details').value);
        formData.append('student_email', document.getElementById('student_email').value);

        const attachmentInput = document.getElementById('attachment');
        if (attachmentInput.files.length > 0) {
            formData.append('attachment', attachmentInput.files[0]);
        }

        try {
            const response = await fetch('/api/reports', {
                method: 'POST',
                body: formData // إرسال بيانات النموذج والملف المرفق
            });

            const result = await response.json();

            if (result.success) {
                responseBox.innerHTML = `
                    <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid var(--primary-emerald); padding: 18px; border-radius: 14px; text-align: center;">
                        <h3 style="color: var(--primary-emerald); margin-bottom: 8px; font-size: 1.1rem;">تم تقديم الطلب وتشفيره بنجاح! 🎉</h3>
                        <p style="font-size: 0.88rem; color: #1e293b; margin-bottom: 10px;">احتفظ برقم التذكرة التالي لمتابعة حالة طلبك لاحقاً:</p>
                        <div style="font-family: monospace; font-size: 1.15rem; font-weight: 800; background: #ffffff; padding: 8px 15px; border-radius: 8px; display: inline-block; color: #0f5132; border: 1px dashed var(--primary-emerald);">
                            ${result.ticket_id}
                        </div>
                    </div>
                `;
                reportForm.reset();
                subCategoryGroup.style.display = 'none';
            } else {
                throw new Error(result.error || 'حدث خطأ غير متوقع');
            }
        } catch (error) {
            responseBox.innerHTML = `
                <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid #ef4444; padding: 15px; border-radius: 12px; color: #991b1b; text-align: center; font-size: 0.9rem;">
                    ❌ ${error.message}
                </div>
            `;
        }
    });

    // -----------------------------------------------------------------
    // 4. الاستعلام اللحظي عن حالة التذكرة (Status Checker)
    // -----------------------------------------------------------------
    const btnCheckStatus = document.getElementById('btnCheckStatus');
    const ticketSearchInput = document.getElementById('ticketSearchId');
    const statusResultCard = document.getElementById('statusResultCard');

    btnCheckStatus.addEventListener('click', async () => {
        const ticketId = ticketSearchInput.value.trim();

        if (!ticketId) {
            alert('يُرجى إدخال رقم التذكرة أولاً.');
            return;
        }

        statusResultCard.style.display = 'none';
        responseBox.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 10px;">جاري البحث عن التذكرة...</div>';

        try {
            const response = await fetch(`/api/reports/status/${encodeURIComponent(ticketId)}`);
            const data = await response.json();

            if (data.success) {
                responseBox.innerHTML = '';
                statusResultCard.style.display = 'block';

                // ضبط الشارة حسب حالة التذكرة
                const badge = document.getElementById('resStatusBadge');
                if (data.status === 'PENDING') {
                    badge.textContent = 'قيد المراجعة 🟡';
                    badge.style.background = '#fef3c7';
                    badge.style.color = '#92400e';
                } else if (data.status === 'PROCESSING') {
                    badge.textContent = 'قيد المعالجة 🔵';
                    badge.style.background = '#dbeafe';
                    badge.style.color = '#1e40af';
                } else if (data.status === 'COMPLETED') {
                    badge.textContent = 'تمت المعالجة 🟢';
                    badge.style.background = '#d1fae5';
                    badge.style.color = '#065f46';
                } else {
                    badge.textContent = data.status;
                    badge.style.background = '#f3f4f6';
                    badge.style.color = '#374151';
                }

                // عرض تفاصيل التذكرة
                const catMap = {
                    'DOC_REQUEST': '📜 طلب وثيقة إدارية',
                    'ABSENCE': '⚠️ غياب أستاذ',
                    'EARLY_LEAVE': '⏱️ خروج مبكر',
                    'LATE': '⏳ تأخر الأستاذ',
                    'GRIEVANCE': '📝 تظلم بيداغوجي',
                    'HARASSMENT': '🔒 بلاغ خاص'
                };

                document.getElementById('resCategory').textContent = catMap[data.category] || data.category;
                document.getElementById('resAdminNote').textContent = data.admin_note || 'لا توجد ملاحظات إضافية من الإدارة حالياً.';
                
                const dateObj = new Date(data.timestamp);
                document.getElementById('resTimestamp').textContent = `تاريخ تقديم الطلب: ${dateObj.toLocaleString('ar-DZ')}`;

            } else {
                statusResultCard.style.display = 'none';
                responseBox.innerHTML = `
                    <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid #ef4444; padding: 15px; border-radius: 12px; color: #991b1b; text-align: center; font-size: 0.9rem;">
                        ⚠️ ${data.message}
                    </div>
                `;
            }
        } catch (error) {
            statusResultCard.style.display = 'none';
            responseBox.innerHTML = `
                <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid #ef4444; padding: 15px; border-radius: 12px; color: #991b1b; text-align: center; font-size: 0.9rem;">
                    ❌ متعذر الاتصال بالخادم، يُرجى المحاولة لاحقاً.
                </div>
            `;
        }
    });
});