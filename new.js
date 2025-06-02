const shareUrl = 'https://1024terabox.com/s/1F4IjkEstMymMXmsHPu-sXg';

// ১) Vercel-হোস্টেড “terabox-dl” অ্যাপ
fetch(`https://terabox-dl.vercel.app/api/dl?link=${encodeURIComponent(shareUrl)}`)
  .then(r => r.json())
  .then(({ download_url, play_url, file_name }) => {
      // download_url → সোজা ডাউনলোড (Content-Disposition attachment)
      // play_url     → ভিডিও/ইমেজ স্ট্রিমিং (Range header সাপোর্ট করে)
      console.log(download_url, play_url);

      // উদাহরণ—ভিডিও প্লেয়ার
      const video = document.querySelector('#player');
      video.src = play_url;
  })
  .catch(console.error);
