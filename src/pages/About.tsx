import "../styles/About.css";

export default function About() {
  return (
    <div className="page">
      <h1 className="page-title">About</h1>

      <p className="about-text">
        Hi! My name is Šimon and I developed this app. I have been learning Japanese since July 2025. 
        When I first started learning kanji, I couldn't find an app that fit my exact needs. 
        That's why I decided to create Kanjii. I wanted a simple, minimalistic tool with the 
        ability to tag kanji based on how well I knew them. 
      </p>
      
      <p className="about-text">
        After building the core tagging system, I added a few more features, and I am still 
        actively working on improving the app.
      </p>
      
      <p className="about-text">
        If you have any ideas or bugs to report, please let me know by{" "}
        <a 
            href="https://github.com/sb-17/kanjii/issues" 
            target="_blank"
            rel="noopener noreferrer"
            className="github-link"
        >
            creating an issue on GitHub
        </a>, or send me an email at{" "}
        <a
            href="mailto:kanjii.simon@gmail.com"
            className="github-link"
        >
            kanjii.simon@gmail.com
        </a>.
      </p>
    </div>
  );
}